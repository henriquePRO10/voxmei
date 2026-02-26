import { useState, useEffect, useMemo } from 'react';
import { BarChart2, FileDown, AlertTriangle, Search, Users, Loader2, PlayCircle, CheckCircle2 } from 'lucide-react';
import { MonthPicker } from '../components/MonthPicker';
import { cn } from '../lib/utils';
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

type Periodo = '3' | '12';

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

function sanitizeFilePart(value: string): string {
    return value
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9_-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

/* ─── componente principal ──────────────────────────────────── */
export function Relatorios() {
    const { currentUser } = useAuth();

    const [clientes, setClientes] = useState<Cliente[]>([]);
    const [tipoRelatorio, setTipoRelatorio] = useState<'faturamento' | 'receitas'>('faturamento');
    const [selectedClientes, setSelectedClientes] = useState<Set<string>>(new Set());
    const [searchTerm, setSearchTerm] = useState('');
    const [periodo, setPeriodo] = useState<Periodo>('3');
    const [mesReceitas, setMesReceitas] = useState(format(new Date(), 'MM/yyyy'));
    const [gerandoLote, setGerandoLote] = useState(false);
    const [loteProgress, setLoteProgress] = useState({ done: 0, total: 0 });
    const [showToast, setShowToast] = useState(false);

    const filteredClientes = useMemo(() => clientes.filter(c =>
        c.nomeFantasia.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.cnpj.includes(searchTerm)
    ), [clientes, searchTerm]);

    const handleSelectAll = (): void => {
        if (selectedClientes.size === filteredClientes.length) {
            setSelectedClientes(new Set());
        } else {
            setSelectedClientes(new Set(filteredClientes.map(c => c.id)));
        }
    };

    const toggleCliente = (id: string): void => {
        const n = new Set(selectedClientes);
        n.has(id) ? n.delete(id) : n.add(id);
        setSelectedClientes(n);
    };

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
        };
        fetchClientes();
    }, [currentUser]);

    const handleGerarLote = async (): Promise<void> => {
        if (selectedClientes.size === 0 || !currentUser) return;
        const clientesToProcess = clientes.filter(c => selectedClientes.has(c.id));
        setGerandoLote(true);
        setLoteProgress({ done: 0, total: clientesToProcess.length });

        for (const cliente of clientesToProcess) {
            try {
                if (tipoRelatorio === 'faturamento') {
                    const todosMeses = getClosedMonths(Number(periodo));
                    const dtAbertura = parseDateAbertura(cliente.dataAbertura);
                    const mesesValidos = dtAbertura
                        ? todosMeses.filter(m => {
                            const dt = parse(m.mesAno, 'yyyy-MM', new Date());
                            return dt >= startOfMonth(dtAbertura);
                        })
                        : todosMeses;
                    if (mesesValidos.length > 0) {
                        await gerarPdf(cliente, mesesValidos);
                    }
                } else {
                    await gerarRelatorioReceitas(cliente, mesReceitas);
                }
            } catch (err: unknown) {
                console.error(`Erro ao gerar relatório para ${cliente.nomeFantasia}:`, err instanceof Error ? err.message : err);
            }
            setLoteProgress(p => ({ ...p, done: p.done + 1 }));
        }

        setGerandoLote(false);
        setShowToast(true);
        setTimeout(() => setShowToast(false), 4000);
    };

    /* ── gerar PDF com pdf-lib ── */
    const gerarPdf = async (cliente: Cliente, meses: { mesAno: string; label: string }[]): Promise<void> => {
        if (!currentUser || meses.length === 0) return;
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
            const competenciaInicio = rows[0]?.mesAno ?? '';
            const competenciaFim = rows[rows.length - 1]?.mesAno ?? '';
            const competencia = competenciaInicio && competenciaFim
                ? (competenciaInicio === competenciaFim ? competenciaInicio : `${competenciaInicio}_a_${competenciaFim}`)
                : 'periodo';
            const nomeClienteArquivo = sanitizeFilePart(cliente.nomeFantasia || cliente.razaoSocial || 'cliente');
            const defaultPath = `Relatorio_Faturamento_${nomeClienteArquivo}_Competencia_${sanitizeFilePart(competencia)}.pdf`;
            const result = await window.api.savePdf(pdfBytes, defaultPath);
            if (!result.success && !result.canceled) {
                console.error('Erro ao salvar PDF:', result.error);
            }
        } catch (err: unknown) {
            console.error('Erro ao gerar PDF:', err instanceof Error ? err.message : err);
        }
    };

    /* ─── Gerar Relatório de Receitas Brutas ─────────────────── */
    const gerarRelatorioReceitas = async (cliente: Cliente, mesRef: string): Promise<void> => {
        if (!currentUser) return;
        try {
            const [mm, yyyy] = mesRef.split('/');
            const mesAnoKey  = `${yyyy}-${mm}`;

            // Período legível: "Janeiro 2026"
            const periodoLabel = (() => {
                const d = parse(mesAnoKey, 'yyyy-MM', new Date());
                const s = format(d, 'LLLL yyyy', { locale: ptBR });
                return s.charAt(0).toUpperCase() + s.slice(1);
            })();

            // Buscar receitas do mês para o cliente
            const q = query(
                collection(db, 'financeiro'),
                where('userId', '==', currentUser.uid),
                where('clienteId', '==', cliente.id),
                where('tipo', '==', 'Receita')
            );
            const snap = await getDocs(q);

            let comSemNF = 0, comComNF = 0;
            let indSemNF = 0, indComNF = 0;
            let serSemNF = 0, serComNF = 0;

            snap.docs.forEach(d => {
                const data = d.data();
                if (!(data.data as string)?.startsWith(mesAnoKey)) return;
                const cat   = data.categoria as string;
                const hasNf = Boolean(data.hasNf);
                const valor = Number(data.valor) || 0;
                if (cat === 'Comércio')   { hasNf ? (comComNF += valor) : (comSemNF += valor); }
                else if (cat === 'Indústria') { hasNf ? (indComNF += valor) : (indSemNF += valor); }
                else if (cat === 'Serviços')  { hasNf ? (serComNF += valor) : (serSemNF += valor); }
            });

            const I   = comSemNF,  II   = comComNF,  III = I   + II;
            const IV  = indSemNF,  V    = indComNF,  VI  = IV  + V;
            const VII = serSemNF,  VIII = serComNF,  IX  = VII + VIII;
            const X   = III + VI + IX;

            // ── Gerar PDF ──────────────────────────────────────────
            const pdfDoc   = await PDFDocument.create();
            const page     = pdfDoc.addPage(PageSizes.A4);
            const { width, height } = page.getSize();

            const fontReg  = await pdfDoc.embedFont(StandardFonts.Helvetica);
            const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

            const black = rgb(0, 0, 0);
            const gray  = rgb(0.87, 0.87, 0.87);

            const mX = 40;
            const cW = width - mX * 2; // ≈ 515

            // Coluna de valor começa em 78% da largura
            const valColX = mX + cW * 0.78;

            // Formata valor ou traço
            const fmtVal = (v: number) =>
                v === 0 ? '-' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            const titleH = 24;
            const hdrH   = 17;
            const secH   = 17;
            const itemH  = 15;
            const spaceH = 8;
            const grandH = 20;

            let y = height - 48;
            const tableTopY = y;

            // Linha horizontal
            const hLine = (at: number, thick = 0.5) =>
                page.drawLine({ start: { x: mX, y: at }, end: { x: mX + cW, y: at }, color: black, thickness: thick });

            // Linha de item com valor
            const drawRow = (label: string, value: number | null, bold: boolean, rowH: number, bg?: ReturnType<typeof rgb>) => {
                if (bg) page.drawRectangle({ x: mX, y: y - rowH, width: cW, height: rowH, color: bg });
                const font     = bold ? fontBold : fontReg;
                const fontSize = 8.5;
                const textY    = y - rowH + (rowH - fontSize) / 2;
                page.drawText(label, { x: mX + 5, y: textY, size: fontSize, font, color: black });
                if (value !== null) {
                    page.drawText('R$', { x: valColX + 4, y: textY, size: fontSize, font: fontReg, color: black });
                    const valStr = fmtVal(value);
                    const valW   = font.widthOfTextAtSize(valStr, fontSize);
                    page.drawText(valStr, { x: mX + cW - valW - 4, y: textY, size: fontSize, font, color: black });
                }
                y -= rowH;
                hLine(y);
            };

            // Cabeçalho de seção (fundo cinza, texto centralizado)
            const drawSection = (title: string) => {
                page.drawRectangle({ x: mX, y: y - secH, width: cW, height: secH, color: gray });
                const tw = fontBold.widthOfTextAtSize(title, 8.5);
                page.drawText(title, { x: mX + (cW - tw) / 2, y: y - secH + (secH - 8.5) / 2, size: 8.5, font: fontBold, color: black });
                y -= secH;
                hLine(y);
            };

            // === Título ===
            page.drawRectangle({ x: mX, y: y - titleH, width: cW, height: titleH, color: gray });
            const titleText = 'RELATÓRIO MENSAL DAS RECEITAS BRUTAS';
            const titleW    = fontBold.widthOfTextAtSize(titleText, 11);
            page.drawText(titleText, { x: mX + (cW - titleW) / 2, y: y - titleH + (titleH - 11) / 2, size: 11, font: fontBold, color: black });
            y -= titleH;
            hLine(y);

            // === Header info ===
            const drawHdr = (label: string, value: string) => {
                const fs    = 9;
                const textY = y - hdrH + (hdrH - fs) / 2;
                const lw    = fontBold.widthOfTextAtSize(label, fs);
                page.drawText(label, { x: mX + 5, y: textY, size: fs, font: fontBold,  color: black });
                page.drawText(value, { x: mX + 5 + lw, y: textY, size: fs, font: fontReg, color: black });
                y -= hdrH;
                hLine(y);
            };

            drawHdr('CNPJ: ', cliente.cnpj);
            drawHdr('Empreendedor Individual: ', (cliente.razaoSocial || cliente.nomeFantasia).toUpperCase());
            drawHdr('Período de Apuração: ', periodoLabel);

            // Espaçador
            y -= spaceH;
            hLine(y);

            // === Seção 1: Comércio ===
            drawSection('RECEITA BRUTA MENSAL – REVENDA DE MERCADORIAS (COMÉRCIO)');
            const seg1Top = y;
            drawRow('I – Revenda de mercadorias com dispensa de emissão de documento fiscal', I, false, itemH);
            drawRow('II – Revenda de mercadorias com documento fiscal emitido', II, false, itemH);
            drawRow('III – Total das receitas com revenda de mercadorias (I + II)', III, true, itemH);
            const seg1Bottom = y;

            // === Seção 2: Indústria ===
            drawSection('RECEITA BRUTA MENSAL – VENDA DE PRODUTOS INDUSTRIALIZADOS (INDÚSTRIA)');
            const seg2Top = y;
            drawRow('IV – Venda de produtos industrializados com dispensa de emissão de documento fiscal', IV, false, itemH);
            drawRow('V – Venda de produtos industrializados com documento fiscal emitido', V, false, itemH);
            drawRow('VI – Total das receitas com venda de produtos industrializados (IV + V)', VI, true, itemH);
            const seg2Bottom = y;

            // === Seção 3: Serviços ===
            drawSection('RECEITA BRUTA MENSAL – PRESTAÇÃO DE SERVIÇOS');
            const seg3Top = y;
            drawRow('VII – Receita com prestação de serviços com dispensa de emissão de documento fiscal', VII, false, itemH);
            drawRow('VIII – Receita com prestação de serviços com documento fiscal emitido', VIII, false, itemH);
            drawRow('IX – Total das receitas com prestação de serviços (VII + VIII)', IX, true, itemH);
            const seg3Bottom = y;

            // Espaçador
            y -= spaceH;
            hLine(y);

            // === Total Geral (fundo cinza) ===
            const grandTop = y;
            page.drawRectangle({ x: mX, y: y - grandH, width: cW, height: grandH, color: gray });
            const grandLabel  = 'X – Total geral das receitas brutas no mês (III + VI + IX)';
            const grandTextY  = y - grandH + (grandH - 9) / 2;
            page.drawText(grandLabel, { x: mX + 5, y: grandTextY, size: 9, font: fontBold, color: black });
            page.drawText('R$', { x: valColX + 4, y: grandTextY, size: 9, font: fontBold, color: black });
            const grandValStr = fmtVal(X);
            const grandValW   = fontBold.widthOfTextAtSize(grandValStr, 9);
            page.drawText(grandValStr, { x: mX + cW - grandValW - 4, y: grandTextY, size: 9, font: fontBold, color: black });
            y -= grandH;
            const grandBottom = y;

            const tableBottomY = y;

            // === Bordas externas (por cima de tudo) ===
            page.drawLine({ start: { x: mX,      y: tableTopY    }, end: { x: mX + cW, y: tableTopY    }, color: black, thickness: 1.2 });
            page.drawLine({ start: { x: mX,      y: tableBottomY }, end: { x: mX + cW, y: tableBottomY }, color: black, thickness: 1.2 });
            page.drawLine({ start: { x: mX,      y: tableBottomY }, end: { x: mX,      y: tableTopY    }, color: black, thickness: 1.2 });
            page.drawLine({ start: { x: mX + cW, y: tableBottomY }, end: { x: mX + cW, y: tableTopY    }, color: black, thickness: 1.2 });
            // Separador vertical apenas nas linhas de dados e total (não nas seções/título/cabeçalhos)
            for (const [top, bottom] of [[seg1Top, seg1Bottom], [seg2Top, seg2Bottom], [seg3Top, seg3Bottom], [grandTop, grandBottom]]) {
                page.drawLine({ start: { x: valColX, y: bottom }, end: { x: valColX, y: top }, color: black, thickness: 0.6 });
            }

            // === Rodapé ===
            y -= 50;
            const hoje     = new Date();
            const mesNome  = format(hoje, 'MMMM', { locale: ptBR });
            const cidadeData = `Sinop - ${format(hoje, 'dd')} ${mesNome.charAt(0).toUpperCase() + mesNome.slice(1)} ${format(hoje, 'yyyy')}`;
            const cdW = fontReg.widthOfTextAtSize(cidadeData, 9);
            page.drawText(cidadeData, { x: mX + (cW - cdW) / 2, y, size: 9, font: fontReg, color: black });

            // Linha de assinatura
            y -= 65;
            const sigW = cW * 0.5;
            const sigX = mX + (cW - sigW) / 2;
            page.drawLine({ start: { x: sigX, y }, end: { x: sigX + sigW, y }, color: black, thickness: 0.8 });
            const assinLabel = 'ASSINATURA DO EMPRESÁRIO';
            const assinW     = fontReg.widthOfTextAtSize(assinLabel, 8.5);
            page.drawText(assinLabel, { x: mX + (cW - assinW) / 2, y: y - 14, size: 8.5, font: fontReg, color: black });

            // Anexos
            y -= 55;
            const leftAnexo = mX + (cW - cW * 0.9) / 2;
            page.drawText('ANEXOS:', { x: leftAnexo, y, size: 8.5, font: fontBold, color: black });
            page.drawText('- Documentos fiscais comprobatórios das entradas de mercadorias e serviços tomados referentes ao período', {
                x: leftAnexo, y: y - 14, size: 8, font: fontReg, color: black,
            });
            page.drawText('- As notas fiscais relativas às operações ou prestações realizadas eventualmente emitidas.', {
                x: leftAnexo, y: y - 27, size: 8, font: fontReg, color: black,
            });

            // Salvar arquivo
            const pdfBytes = await pdfDoc.save();
            const nomeClienteArquivo = sanitizeFilePart(cliente.nomeFantasia || cliente.razaoSocial || 'cliente');
            const nomeArq  = `Relatorio_ReceitasBrutas_${nomeClienteArquivo}_Competencia_${sanitizeFilePart(mesAnoKey)}.pdf`;
            const result   = await window.api.savePdf(pdfBytes, nomeArq);
            if (!result.success && !result.canceled) {
                console.error('Erro ao salvar PDF:', result.error);
            }
        } catch (err) {
            console.error('Erro ao gerar relatório de receitas brutas:', err instanceof Error ? err.message : err);
        }
    };

    /* ────────── render ────────── */
    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col">

            {/* Header */}
            <div className="flex justify-between items-center bg-white p-5 rounded-2xl shadow-sm border border-slate-100 shrink-0">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
                        <div className="bg-blue-100 text-blue-600 p-1.5 rounded-lg">
                            <BarChart2 className="w-5 h-5" />
                        </div>
                        Relatórios
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">Configure e gere relatórios em lote para seus clientes</p>
                </div>
            </div>

            {/* Bento Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 flex-1 min-h-0">

                {/* Coluna Esquerda: Configurações (Span 4) */}
                <div className="lg:col-span-4 flex flex-col gap-4 h-full">

                    {/* Tipo de Relatório */}
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 shrink-0">
                        <h2 className="text-base font-bold text-slate-800 mb-4 flex items-center gap-2">
                            <FileDown className="w-4 h-4 text-blue-500" />
                            Tipo de Relatório
                        </h2>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => setTipoRelatorio('faturamento')}
                                className={cn(
                                    'text-left px-3 py-2.5 rounded-xl text-sm font-medium border transition cursor-pointer',
                                    tipoRelatorio === 'faturamento'
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-500/30'
                                        : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                                )}
                            >
                                Faturamento Mensal
                            </button>
                            <button
                                onClick={() => setTipoRelatorio('receitas')}
                                className={cn(
                                    'text-left px-3 py-2.5 rounded-xl text-sm font-medium border transition cursor-pointer',
                                    tipoRelatorio === 'receitas'
                                        ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-500/30'
                                        : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                                )}
                            >
                                Receitas Brutas Mensais
                            </button>
                        </div>
                    </div>

                    {/* Opções dinâmicas por tipo */}
                    {tipoRelatorio === 'faturamento' ? (
                        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 shrink-0">
                            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Período</h2>
                            <div className="flex gap-2">
                                {(['3', '12'] as Periodo[]).map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setPeriodo(p)}
                                        className={cn(
                                            'flex-1 py-2 rounded-xl text-sm font-medium border transition cursor-pointer',
                                            periodo === p
                                                ? 'bg-blue-600 border-blue-600 text-white shadow-sm shadow-blue-500/30'
                                                : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'
                                        )}
                                    >
                                        {p} meses
                                    </button>
                                ))}
                            </div>
                            <div className="mt-4">
                                <p className="text-xs font-medium text-slate-500 mb-2">Meses que serão incluídos</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {getClosedMonths(Number(periodo)).map(m => (
                                        <span key={m.mesAno} className="px-2.5 py-0.5 bg-blue-50 text-blue-700 rounded-full text-xs font-medium border border-blue-100">
                                            {m.label}
                                        </span>
                                    ))}
                                </div>
                                <p className="text-[10px] text-slate-400 mt-2.5 flex items-center gap-1">
                                    <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                                    Meses anteriores à abertura do CNPJ são excluídos automaticamente
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 shrink-0">
                            <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Mês de Referência</h2>
                            <MonthPicker value={mesReceitas} onChange={setMesReceitas} accent="blue" />
                        </div>
                    )}

                    {/* Card de Ação */}
                    <div className="bg-slate-900 rounded-2xl p-5 text-center relative overflow-hidden shadow-lg flex-1 flex flex-col justify-center">
                        <div className="relative z-10 space-y-4">
                            <div className="mx-auto w-12 h-12 bg-blue-600/20 backdrop-blur-md rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(37,99,235,0.3)]">
                                {gerandoLote
                                    ? <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
                                    : <PlayCircle className="w-6 h-6 text-blue-400" />
                                }
                            </div>

                            <div>
                                <h2 className="text-xl font-bold text-white tracking-tight mb-1">Gerar Relatórios</h2>
                                <p className="text-xs text-slate-400 font-medium px-2">
                                    {gerandoLote
                                        ? `Gerando ${loteProgress.done + 1} de ${loteProgress.total}...`
                                        : `Para ${selectedClientes.size} cliente${selectedClientes.size !== 1 ? 's' : ''} selecionado${selectedClientes.size !== 1 ? 's' : ''}`
                                    }
                                </p>
                            </div>

                            <button
                                onClick={handleGerarLote}
                                disabled={gerandoLote || selectedClientes.size === 0}
                                className={cn(
                                    'w-full py-2.5 rounded-lg font-bold text-sm shadow-lg transition-all duration-300 flex items-center justify-center gap-2',
                                    'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30 hover:-translate-y-0.5',
                                    'cursor-pointer disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed'
                                )}
                            >
                                {gerandoLote
                                    ? <><Loader2 className="w-4 h-4 animate-spin" /> Gerando PDFs...</>
                                    : <><FileDown className="w-4 h-4" /> Gerar Selecionados</>
                                }
                            </button>

                            {selectedClientes.size === 0 && (
                                <p className="text-[10px] text-amber-400 flex items-center justify-center gap-1">
                                    <AlertTriangle className="w-3 h-3" />
                                    Selecione ao menos um cliente
                                </p>
                            )}
                        </div>
                    </div>
                </div>

                {/* Coluna Direita: Lista de Clientes (Span 8) */}
                <div className="lg:col-span-8 bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden h-full">

                    {/* Header da Lista */}
                    <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                        <div className="flex items-center gap-2">
                            <Users className="w-4 h-4 text-slate-500" />
                            <h2 className="text-base font-bold text-slate-800">Seleção de Clientes</h2>
                            <span className="bg-blue-100 text-blue-700 text-[10px] font-bold px-2 py-0.5 rounded-full ml-1">
                                {selectedClientes.size} / {filteredClientes.length}
                            </span>
                        </div>
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Buscar cliente ou CNPJ..."
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs focus:ring-2 focus:ring-blue-500 outline-none w-full sm:w-56 transition-shadow"
                            />
                        </div>
                    </div>

                    {/* Tabela com Scroll */}
                    <div className="flex-1 overflow-auto p-1">
                        {clientes.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
                                <Users className="w-10 h-10 opacity-20" />
                                <p className="text-sm">Nenhum cliente cadastrado.</p>
                            </div>
                        ) : filteredClientes.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
                                <Search className="w-10 h-10 opacity-20" />
                                <p className="text-sm">Nenhum cliente encontrado.</p>
                            </div>
                        ) : (
                            <table className="w-full text-left text-xs">
                                <thead className="sticky top-0 bg-white/90 backdrop-blur-sm z-10 shadow-sm">
                                    <tr className="text-slate-500 font-medium border-b border-slate-100">
                                        <th className="p-2 w-10 text-center">
                                            <input
                                                type="checkbox"
                                                checked={selectedClientes.size === filteredClientes.length && filteredClientes.length > 0}
                                                onChange={handleSelectAll}
                                                className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                            />
                                        </th>
                                        <th className="p-2">Nome Fantasia</th>
                                        <th className="p-2">CNPJ</th>
                                        <th className="p-2">Abertura</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filteredClientes.map(cliente => (
                                        <tr
                                            key={cliente.id}
                                            onClick={() => toggleCliente(cliente.id)}
                                            className={cn(
                                                'group cursor-pointer transition-colors hover:bg-slate-50',
                                                selectedClientes.has(cliente.id) ? 'bg-blue-50/30' : ''
                                            )}
                                        >
                                            <td className="p-2 text-center">
                                                <input
                                                    type="checkbox"
                                                    checked={selectedClientes.has(cliente.id)}
                                                    onChange={() => toggleCliente(cliente.id)}
                                                    onClick={e => e.stopPropagation()}
                                                    className="w-3.5 h-3.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                                />
                                            </td>
                                            <td className="p-2 font-medium text-slate-700 group-hover:text-blue-700 transition-colors">
                                                {cliente.nomeFantasia}
                                            </td>
                                            <td className="p-2 text-slate-500 font-mono text-[10px]">
                                                {cliente.cnpj}
                                            </td>
                                            <td className="p2 text-slate-400 text-[10px]">
                                                {cliente.dataAbertura || '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
            </div>

            {/* Toast de sucesso */}
            {showToast && (
                <div className="fixed top-5 right-5 z-100 flex items-center gap-2.5 bg-emerald-600 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-lg shadow-emerald-500/30 pointer-events-none animate-in slide-in-from-top-2 duration-300">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Relatórios gerados com sucesso!
                </div>
            )}
        </div>
    );
}
