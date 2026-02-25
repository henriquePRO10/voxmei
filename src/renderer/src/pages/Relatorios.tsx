import { useState, useEffect } from 'react';
import { BarChart2, FileDown, AlertTriangle, ChevronDown, User } from 'lucide-react';
import {
    collection, query, where, getDocs
} from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib';
import { format, subMonths, startOfMonth, parse } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';

/* ─── tipos locais ──────────────────────────────────────────── */
interface Cliente {
    id: string;
    nomeFantasia: string;
    razaoSocial: string;
    cnpj: string;
    dataAbertura: string; // DD/MM/AAAA
}

interface ContadorPerfil {
    nomeCompleto: string;
    crc: string;
    assinaturaUrl: string;
}

interface MesFaturamento {
    mesAno: string;   // 'YYYY-MM'
    label: string;    // 'jan/26'
    total: number;
}

type Periodo = '6' | '12';

/* ─── helpers ───────────────────────────────────────────────── */
function parseDateAbertura(d: string): Date | null {
    if (!d || d.length < 8) return null;
    try {
        return parse(d, 'dd/MM/yyyy', new Date());
    } catch {
        return null;
    }
}

function getClosedMonths(n: number): { mesAno: string; label: string }[] {
    const today = new Date();
    // mês fechado mais recente = mês anterior ao atual
    const lastClosed = subMonths(startOfMonth(today), 1);
    const months: { mesAno: string; label: string }[] = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = subMonths(lastClosed, i);
        months.push({
            mesAno: format(d, 'yyyy-MM'),
            label: format(d, 'MMM/yy', { locale: ptBR }).replace('.', ''),
        });
    }
    return months;
}

function formatBRL(value: number): string {
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/* ─── componente principal ──────────────────────────────────── */
export function Relatorios() {
    const { currentUser } = useAuth();

    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [clienteId, setClienteId] = useState('');
    const [periodo, setPeriodo] = useState<Periodo>('6');
    const [gerando, setGerando] = useState(false);

    // Modal de validação de data de abertura
    const [showCnpjAlert, setShowCnpjAlert] = useState(false);
    const [cnpjAlertInfo, setCnpjAlertInfo] = useState<{
        mesesValidos: { mesAno: string; label: string }[];
        clienteNome: string;
        mesAbertura: string;
    } | null>(null);

    /* ── carregar clientes ── */
    useEffect(() => {
        if (!currentUser) return;
        const fetchClientes = async () => {
            const q = query(
                collection(db, 'clientes'),
                where('userId', '==', currentUser.uid),
                where('status', '==', 'Ativo')
            );
            const snap = await getDocs(q);
            const data = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Cliente[];
            data.sort((a, b) => a.nomeFantasia.localeCompare(b.nomeFantasia));
            setClientes(data);
            if (data.length > 0) setClienteId(data[0].id);
        };
        fetchClientes();
    }, [currentUser]);

    /* ── preview de meses (filtrado pelo dataAbertura do cliente selecionado) ── */
    const mesesPreview = (() => {
        const todos = getClosedMonths(Number(periodo));
        const cliente = clientes.find(c => c.id === clienteId);
        if (!cliente) return todos;
        const dtAbertura = parseDateAbertura(cliente.dataAbertura);
        if (!dtAbertura) return todos;
        return todos.filter(m => {
            const dt = parse(m.mesAno, 'yyyy-MM', new Date());
            return dt >= startOfMonth(dtAbertura);
        });
    })();

    /* ── validação de data + geração ── */
    const handleGerar = async () => {
        if (!clienteId || !currentUser) return;
        const cliente = clientes.find(c => c.id === clienteId);
        if (!cliente) return;

        const todosMeses = getClosedMonths(Number(periodo));
        let mesesValidos = todosMeses;

        // Validar dataAbertura
        const dtAbertura = parseDateAbertura(cliente.dataAbertura);
        if (dtAbertura) {
            const inicioRelatorio = parse(todosMeses[0].mesAno, 'yyyy-MM', new Date());
            if (dtAbertura > inicioRelatorio) {
                // Abertura é APÓS o início do período → filtrar meses válidos
                const mesesFiltrados = todosMeses.filter(m => {
                    const dt = parse(m.mesAno, 'yyyy-MM', new Date());
                    return dt >= startOfMonth(dtAbertura);
                });
                if (mesesFiltrados.length === 0) {
                    // CNPJ foi aberto depois de todos os meses do período
                    setCnpjAlertInfo({
                        mesesValidos: [],
                        clienteNome: cliente.nomeFantasia,
                        mesAbertura: format(dtAbertura, 'MMMM/yyyy', { locale: ptBR }),
                    });
                    setShowCnpjAlert(true);
                    return;
                }
                setCnpjAlertInfo({
                    mesesValidos: mesesFiltrados,
                    clienteNome: cliente.nomeFantasia,
                    mesAbertura: format(dtAbertura, 'MMMM/yyyy', { locale: ptBR }),
                });
                setShowCnpjAlert(true);
                mesesValidos = mesesFiltrados;
                return; // aguarda confirmação do modal
            }
        }

        await gerarPdf(cliente, mesesValidos);
    };

    const handleConfirmarParcial = async () => {
        setShowCnpjAlert(false);
        if (!cnpjAlertInfo || !clienteId) return;
        const cliente = clientes.find(c => c.id === clienteId);
        if (!cliente) return;
        await gerarPdf(cliente, cnpjAlertInfo.mesesValidos);
    };

    /* ── gerar PDF com pdf-lib ── */
    const gerarPdf = async (cliente: Cliente, meses: { mesAno: string; label: string }[]) => {
        if (!currentUser || meses.length === 0) return;
        setGerando(true);
        try {
            // 1. Buscar dados de faturamento
            const faturamentoPorMes: Record<string, number> = {};
            meses.forEach(m => { faturamentoPorMes[m.mesAno] = 0; });

            const q = query(
                collection(db, 'financeiro'),
                where('userId', '==', currentUser.uid),
                where('clienteId', '==', cliente.id),
                where('tipo', '==', 'Receita')
            );
            const snap = await getDocs(q);
            snap.docs.forEach(d => {
                const data = d.data();
                const mesAno = (data.data as string)?.substring(0, 7); // YYYY-MM
                if (mesAno && faturamentoPorMes[mesAno] !== undefined) {
                    faturamentoPorMes[mesAno] += Number(data.valor) || 0;
                }
            });

            const rows: MesFaturamento[] = meses.map(m => ({
                mesAno: m.mesAno,
                label: m.label,
                total: faturamentoPorMes[m.mesAno],
            }));
            const totalGeral = rows.reduce((s, r) => s + r.total, 0);

            // 2. Buscar perfil do contador
            let perfil: ContadorPerfil | null = null;
            const pq = query(collection(db, 'contador_perfil'), where('userId', '==', currentUser.uid));
            const psnap = await getDocs(pq);
            if (!psnap.empty) perfil = psnap.docs[0].data() as ContadorPerfil;

            // 3. Montar PDF
            const pdfDoc = await PDFDocument.create();
            const page = pdfDoc.addPage(PageSizes.A4); // 595 × 842
            const { width, height } = page.getSize();

            const fontReg = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
            const fontObl = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

            const marginX = 48;
            const contentW = width - marginX * 2;
            const black = rgb(0, 0, 0);
            const gray = rgb(0.3, 0.3, 0.3);
            const lightGray = rgb(0.9, 0.9, 0.9);
            const white = rgb(1, 1, 1);

            let y = height - 40;

            /* ── Caixa de cabeçalho (empresa + CNPJ) ── */
            // Quebrar nome em linhas se muito largo
            const razao = (cliente.razaoSocial || cliente.nomeFantasia).toUpperCase();
            const razaoSize = 13;
            const razaoMaxW = contentW - 24;
            const razaoWords = razao.split(' ');
            const razaoLines: string[] = [];
            let razaoCur = '';
            for (const word of razaoWords) {
                const test = razaoCur ? `${razaoCur} ${word}` : word;
                if (fontBold.widthOfTextAtSize(test, razaoSize) > razaoMaxW) {
                    razaoLines.push(razaoCur);
                    razaoCur = word;
                } else {
                    razaoCur = test;
                }
            }
            if (razaoCur) razaoLines.push(razaoCur);

            const razaoLineH = razaoSize + 5;
            const boxH = razaoLines.length > 1
                ? 16 + razaoLines.length * razaoLineH + 22   // nome multi-linha + CNPJ
                : 60;                                         // tamanho padrão
            page.drawRectangle({
                x: marginX, y: y - boxH,
                width: contentW, height: boxH,
                borderColor: black, borderWidth: 1,
                color: white,
            });

            // Razão social (pode ser multi-linha)
            const totalRazaoH = razaoLines.length * razaoLineH;
            const razaoStartY = y - (boxH - totalRazaoH - 20) / 2 - razaoLineH + 4;
            razaoLines.forEach((line, i) => {
                const lw = fontBold.widthOfTextAtSize(line, razaoSize);
                page.drawText(line, {
                    x: marginX + (contentW - lw) / 2,
                    y: razaoStartY - i * razaoLineH,
                    size: razaoSize, font: fontBold, color: black,
                });
            });

            // CNPJ
            const cnpjText = `CNPJ: ${cliente.cnpj}`;
            const cnpjSize = 10;
            const cnpjW = fontReg.widthOfTextAtSize(cnpjText, cnpjSize);
            page.drawText(cnpjText, {
                x: marginX + (contentW - cnpjW) / 2,
                y: y - boxH + 10,
                size: cnpjSize, font: fontReg, color: black,
            });

            y -= boxH + 8;

            /* ── Caixa de declaração legal (texto laranja) ── */
            const declText =
                'Declaramos, sob as penas da lei, especialmente das previsões do artigo 298 do Código Penal Brasileiro, ' +
                'nos incisos XX e XXIV do artigo 24 do Estatuto dos Conselhos Regionais de Contabilidade e ' +
                'Resolução CFC nº 825/98, que as informações abaixo transcritas constituem a expressão da verdade.';

            const declSize = 7.5;
            const declMaxW = contentW - 16;
            // Quebrar texto em linhas
            const declWords = declText.split(' ');
            const declLines: string[] = [];
            let declCur = '';
            for (const word of declWords) {
                const test = declCur ? `${declCur} ${word}` : word;
                if (fontObl.widthOfTextAtSize(test, declSize) > declMaxW) {
                    declLines.push(declCur);
                    declCur = word;
                } else {
                    declCur = test;
                }
            }
            if (declCur) declLines.push(declCur);

            const declBoxH = declLines.length * (declSize + 3) + 14;
            page.drawRectangle({
                x: marginX, y: y - declBoxH,
                width: contentW, height: declBoxH,
                borderColor: black, borderWidth: 1,
                color: white,
            });
            declLines.forEach((line, i) => {
                const lw = fontObl.widthOfTextAtSize(line, declSize);
                page.drawText(line, {
                    x: marginX + (contentW - lw) / 2,
                    y: y - 12 - i * (declSize + 3),
                    size: declSize,
                    font: fontObl,
                    color: black,
                });
            });

            y -= declBoxH + 50;

            /* ── Título ── */
            const titulo = 'FATURAMENTO MENSAL';
            const tituloSize = 14;
            const tituloW = fontBold.widthOfTextAtSize(titulo, tituloSize);
            page.drawText(titulo, {
                x: marginX + (contentW - tituloW) / 2,
                y,
                size: tituloSize,
                font: fontBold,
                color: black,
            });

            y -= 20;

            /* ── Tabela ── 50% da largura, centralizada, linhas duplas, sem azul ── */
            const tableW = contentW * 0.5;
            const col1X = marginX + (contentW - tableW) / 2;
            const col2X = col1X + tableW * 0.5;
            const rowH = 18;
            const textOffY = rowH / 2 - 4; // centralização vertical do texto

            // Guarda y inicial da tabela para o separador vertical
            const tableTopY = y;

            // Cabeçalho da tabela — fundo branco, borda preta
            page.drawRectangle({
                x: col1X, y: y - rowH,
                width: tableW, height: rowH,
                color: white, borderColor: black, borderWidth: 1,
            });
            page.drawText('MÊS', {
                x: col1X + 8, y: y - rowH + textOffY,
                size: 9, font: fontBold, color: black,
            });
            page.drawText('FATURAMENTO', {
                x: col2X + 8, y: y - rowH + textOffY,
                size: 9, font: fontBold, color: black,
            });
            y -= rowH;

            // Linhas de dados
            rows.forEach((row, idx) => {
                const bg = idx % 2 === 0 ? white : lightGray;
                page.drawRectangle({
                    x: col1X, y: y - rowH,
                    width: tableW, height: rowH,
                    color: bg, borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5,
                });
                page.drawText(row.label.toUpperCase(), {
                    x: col1X + 8, y: y - rowH + textOffY,
                    size: 9, font: fontReg, color: black,
                });
                const valStr = formatBRL(row.total);
                page.drawText(valStr, {
                    x: col2X + 8, y: y - rowH + textOffY,
                    size: 9, font: fontReg, color: black,
                });
                y -= rowH;
            });

            // Linha de total — fundo branco, borda preta, texto bold
            page.drawRectangle({
                x: col1X, y: y - rowH,
                width: tableW, height: rowH,
                color: white, borderColor: black, borderWidth: 1,
            });
            page.drawText('TOTAL', {
                x: col1X + 8, y: y - rowH + textOffY,
                size: 9, font: fontBold, color: black,
            });
            page.drawText(formatBRL(totalGeral), {
                x: col2X + 8, y: y - rowH + textOffY,
                size: 9, font: fontBold, color: black,
            });
            y -= rowH;

            // Separador vertical (entre MÊS e FATURAMENTO)
            page.drawLine({
                start: { x: col2X, y },
                end: { x: col2X, y: tableTopY },
                color: rgb(0.5, 0.5, 0.5), thickness: 0.5,
            });

            /* ── Assinaturas verticais e cidade/data — coordenadas fixas a partir do rodapé ── */
            // largura e centro horizontal para todas as seções de assinatura
            const sigW = contentW * 0.55;
            const sigCX = marginX + (contentW - sigW) / 2; // x inicial centralizado

            // --- CLIENTE (em cima) ---
            const clienteLineY = 82 + 110;
            page.drawLine({
                start: { x: sigCX, y: clienteLineY },
                end: { x: sigCX + sigW, y: clienteLineY },
                color: black, thickness: 0.8,
            });
            const clienteName = (cliente.razaoSocial || cliente.nomeFantasia).toUpperCase();
            const cnW = fontBold.widthOfTextAtSize(clienteName, 8);
            page.drawText(clienteName, {
                x: sigCX + Math.max(0, (sigW - cnW) / 2), y: clienteLineY - 14,
                size: 8, font: fontBold, color: black,
            });
            const cnpjSigText = `CNPJ ${cliente.cnpj}`;
            const cnpjSigW = fontReg.widthOfTextAtSize(cnpjSigText, 7.5);
            page.drawText(cnpjSigText, {
                x: sigCX + Math.max(0, (sigW - cnpjSigW) / 2), y: clienteLineY - 26,
                size: 7.5, font: fontReg, color: gray,
            });

            // --- CONTADOR (em baixo) ---
            const contadorLineY = 82;
            const sigImgMaxH = 50; // altura máxima da imagem de assinatura

            if (perfil?.assinaturaUrl) {
                try {
                    const imgRes = await fetch(perfil.assinaturaUrl);
                    if (!imgRes.ok) throw new Error(`HTTP ${imgRes.status}`);
                    const imgBuf = await imgRes.arrayBuffer();
                    // Tenta embutir como PNG primeiro; se falhar, tenta JPG
                    let img;
                    try {
                        img = await pdfDoc.embedPng(imgBuf);
                    } catch {
                        img = await pdfDoc.embedJpg(imgBuf);
                    }
                    const imgDims = img.scaleToFit(sigW * 0.65, sigImgMaxH);
                    page.drawImage(img, {
                        x: sigCX + (sigW - imgDims.width) / 2,
                        y: contadorLineY,
                        width: imgDims.width,
                        height: imgDims.height,
                    });
                } catch (imgErr) {
                    console.error('Erro ao embutir assinatura no PDF:', imgErr);
                }
            }

            page.drawLine({
                start: { x: sigCX, y: contadorLineY },
                end: { x: sigCX + sigW, y: contadorLineY },
                color: black, thickness: 0.8,
            });

            const contadorNome = (perfil?.nomeCompleto || 'Contador Responsável').toUpperCase();
            const cNomeW = fontBold.widthOfTextAtSize(contadorNome, 8);
            page.drawText(contadorNome, {
                x: sigCX + Math.max(0, (sigW - cNomeW) / 2), y: contadorLineY - 14,
                size: 8, font: fontBold, color: black,
            });

            const crcText = perfil?.crc || '';
            if (crcText) {
                const crcW = fontReg.widthOfTextAtSize(crcText, 7.5);
                page.drawText(crcText, {
                    x: sigCX + Math.max(0, (sigW - crcW) / 2), y: contadorLineY - 26,
                    size: 7.5, font: fontReg, color: gray,
                });
            }

            /* ── Cidade/data — acima do bloco do cliente ── */
            const dataY = clienteLineY + 90;
            const hoje = new Date();
            const cidadeData = `Sinop, ${format(hoje, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })}`;
            const cdW = fontObl.widthOfTextAtSize(cidadeData, 9);
            page.drawText(cidadeData, {
                x: marginX + (contentW - cdW) / 2,
                y: dataY,
                size: 9, font: fontObl, color: gray,
            });

            /* ── Salvar ── */
            const pdfBytes = await pdfDoc.save();
            const nomeMeses = `${rows[0]?.label ?? ''}-a-${rows[rows.length - 1]?.label ?? ''}`;
            const defaultPath = `Faturamento_${cliente.nomeFantasia.replace(/\s+/g, '_')}_${nomeMeses}.pdf`;
            const result = await window.api.savePdf(pdfBytes, defaultPath);
            if (!result.success && !result.canceled) {
                console.error('Erro ao salvar PDF:', result.error);
            }
        } catch (err) {
            console.error('Erro ao gerar PDF:', err);
        } finally {
            setGerando(false);
        }
    };

    const clienteSelecionado = clientes.find(c => c.id === clienteId);

    /* ────────── render ────────── */
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Título da página */}
            <div className="flex items-center gap-3 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div className="bg-blue-100 text-blue-600 p-2 rounded-xl">
                    <BarChart2 className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">Relatórios</h1>
                    <p className="text-slate-500 mt-0.5 text-sm">Gere relatórios em PDF para seus clientes</p>
                </div>
            </div>

            {/* Card de Faturamento */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
                <div className="flex items-center gap-2 mb-5">
                    <FileDown className="w-5 h-5 text-slate-500" />
                    <h2 className="text-base font-semibold text-slate-700">Relatório de Faturamento Mensal</h2>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Seletor de cliente */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Cliente
                        </label>
                        <div className="relative">
                            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                            <select
                                value={clienteId}
                                onChange={e => setClienteId(e.target.value)}
                                className="w-full border border-slate-200 rounded-xl pl-9 pr-8 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-400 text-slate-700 appearance-none bg-white cursor-pointer"
                            >
                                {clientes.length === 0 && (
                                    <option value="">Nenhum cliente cadastrado</option>
                                )}
                                {clientes.map(c => (
                                    <option key={c.id} value={c.id}>{c.nomeFantasia}</option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* Seletor de período */}
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1.5">
                            Período
                        </label>
                        <div className="flex gap-2">
                            {(['6', '12'] as Periodo[]).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setPeriodo(p)}
                                    className={`flex-1 py-2.5 rounded-xl text-sm font-medium border transition cursor-pointer ${
                                        periodo === p
                                            ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-500/30'
                                            : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                                    }`}
                                >
                                    Últimos {p} meses
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Preview dos meses */}
                <div className="mt-5">
                    {(() => {
                        const todos = getClosedMonths(Number(periodo));
                        const filtrados = mesesPreview;
                        const excluidos = todos.length - filtrados.length;
                        return (
                            <>
                                <div className="flex items-center gap-2 mb-2">
                                    <p className="text-xs font-medium text-slate-500">Meses que serão incluídos</p>
                                    {excluidos > 0 && (
                                        <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-full px-2 py-0.5 font-medium">
                                            <AlertTriangle className="w-3 h-3" />
                                            {excluidos} excluído{excluidos > 1 ? 's' : ''} (CNPJ aberto em {format(parseDateAbertura(clienteSelecionado?.dataAbertura ?? '') ?? new Date(), 'MMM/yy', { locale: ptBR })} )
                                        </span>
                                    )}
                                </div>
                                {filtrados.length > 0 ? (
                                    <div className="flex flex-wrap gap-1.5">
                                        {filtrados.map(m => (
                                            <span
                                                key={m.mesAno}
                                                className="px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100"
                                            >
                                                {m.label}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-xs text-rose-500 italic">Nenhum mês válido para este cliente no período selecionado.</p>
                                )}
                            </>
                        );
                    })()}
                </div>

                {/* Info do cliente selecionado */}
                {clienteSelecionado && (
                    <div className="mt-4 p-3.5 bg-slate-50 rounded-xl border border-slate-100 text-xs text-slate-600 space-y-0.5">
                        <p><span className="font-medium">Razão Social:</span> {clienteSelecionado.razaoSocial || clienteSelecionado.nomeFantasia}</p>
                        <p><span className="font-medium">CNPJ:</span> {clienteSelecionado.cnpj}</p>
                        {clienteSelecionado.dataAbertura && (
                            <p><span className="font-medium">Abertura:</span> {clienteSelecionado.dataAbertura}</p>
                        )}
                    </div>
                )}

                {/* Botão gerar */}
                <div className="mt-6 flex justify-end">
                    <button
                        onClick={handleGerar}
                        disabled={!clienteId || gerando}
                        className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl shadow-sm shadow-blue-500/30 transition cursor-pointer"
                    >
                        {gerando ? (
                            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                        ) : (
                            <FileDown className="w-4 h-4" />
                        )}
                        {gerando ? 'Gerando PDF...' : 'Gerar PDF'}
                    </button>
                </div>
            </div>

            {/* Modal de alerta de data de abertura do CNPJ */}
            {showCnpjAlert && cnpjAlertInfo && (
                <div
                    className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
                    onClick={() => setShowCnpjAlert(false)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2.5 bg-amber-50 rounded-xl text-amber-600">
                                <AlertTriangle className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-800 text-base">Atenção — CNPJ recente</h3>
                                <p className="text-sm text-slate-500 mt-0.5">
                                    O CNPJ de <span className="font-medium text-slate-700">{cnpjAlertInfo.clienteNome}</span> foi aberto em <span className="font-medium text-slate-700">{cnpjAlertInfo.mesAbertura}</span>,
                                    que é posterior ao início do período solicitado.
                                </p>
                            </div>
                        </div>

                        {cnpjAlertInfo.mesesValidos.length === 0 ? (
                            <div className="p-3 bg-rose-50 rounded-xl text-sm text-rose-700 mb-5">
                                Não há meses válidos para gerar o relatório neste período. O CNPJ foi aberto após todos os meses selecionados.
                            </div>
                        ) : (
                            <>
                                <p className="text-sm text-slate-600 mb-2">
                                    O relatório será gerado a partir do mês de abertura. Meses incluídos:
                                </p>
                                <div className="flex flex-wrap gap-1.5 mb-5">
                                    {cnpjAlertInfo.mesesValidos.map(m => (
                                        <span key={m.mesAno} className="px-2.5 py-0.5 bg-amber-50 text-amber-700 rounded-full text-xs font-medium border border-amber-100">
                                            {m.label}
                                        </span>
                                    ))}
                                </div>
                            </>
                        )}

                        <div className="flex justify-end gap-3">
                            <button
                                onClick={() => setShowCnpjAlert(false)}
                                className="px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-xl transition cursor-pointer"
                            >
                                Cancelar
                            </button>
                            {cnpjAlertInfo.mesesValidos.length > 0 && (
                                <button
                                    onClick={handleConfirmarParcial}
                                    className="px-5 py-2 text-sm font-semibold bg-amber-500 hover:bg-amber-600 text-white rounded-xl shadow-sm shadow-amber-500/30 transition cursor-pointer"
                                >
                                    Gerar assim mesmo
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
