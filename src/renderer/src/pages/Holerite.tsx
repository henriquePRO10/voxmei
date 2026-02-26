import { useState, useEffect, useMemo } from 'react';
import { FileBadge, Download, Search, Users, Loader2, CheckSquare, Square, Trash2, AlertCircle } from 'lucide-react';
import { MonthPicker } from '../components/MonthPicker';
import { collection, getDocs, query, where, Timestamp, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';
import { cn } from '../lib/utils';

interface ProLabore {
    id: string;
    clienteId: string;
    nomeFantasia: string;
    razaoSocial?: string; // Adicionado razaoSocial
    cnpj: string;
    endereco?: string; // Adicionado endereco
    mesAno: string;
    salarioMinimo: number;
    inssPerc: number;
    valorInss: number;
    valorLiquido: number;
    geradoEm: Timestamp;
    userId: string;
}

export function Holerite() {
    const [proLabores, setProLabores] = useState<ProLabore[]>([]);
    const [filterMonth, setFilterMonth] = useState(format(new Date(), 'MM/yyyy'));
    const [searchTerm, setSearchTerm] = useState('');
    const [isGeneratingPdf, setIsGeneratingPdf] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
    const [deleteModal, setDeleteModal] = useState<{ isOpen: boolean, type: 'single' | 'batch', id?: string }>({ isOpen: false, type: 'single' });
    const { currentUser } = useAuth();

    const fetchProLabores = async () => {
        if (!currentUser || filterMonth.length !== 7) return;
        setIsLoading(true);
        try {
            const q = query(
                collection(db, 'pro_labores'),
                where('userId', '==', currentUser.uid),
                where('mesAno', '==', filterMonth)
            );
            const querySnapshot = await getDocs(q);
            const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ProLabore[];
            
            // Ordenar alfabeticamente
            data.sort((a, b) => a.nomeFantasia.localeCompare(b.nomeFantasia));
            setProLabores(data);
            setSelectedItems(new Set()); // Limpa seleção ao mudar de mês
        } catch (error) {
            console.error("Erro ao buscar pró-labores:", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchProLabores();
    }, [filterMonth, currentUser]);

    const filteredProLabores = useMemo(() => {
        return proLabores.filter(item => 
            item.nomeFantasia.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.cnpj.includes(searchTerm)
        );
    }, [proLabores, searchTerm]);

    const handleSelectAll = () => {
        if (selectedItems.size === filteredProLabores.length) {
            setSelectedItems(new Set());
        } else {
            setSelectedItems(new Set(filteredProLabores.map(item => item.id)));
        }
    };

    const toggleItem = (id: string) => {
        const newSelected = new Set(selectedItems);
        if (newSelected.has(id)) {
            newSelected.delete(id);
        } else {
            newSelected.add(id);
        }
        setSelectedItems(newSelected);
    };

    const generateSinglePdf = async (item: ProLabore): Promise<Uint8Array | null> => {
        try {
            let pdfBytes: ArrayBuffer | Uint8Array;
            try {
                const url = new URL('../assets/holerite-template.pdf', import.meta.url).href;
                const res = await fetch(url);
                if (!res.ok) throw new Error('Template não encontrado');
                pdfBytes = await res.arrayBuffer();
                
                const pdfDoc = await PDFDocument.load(pdfBytes);
                const form = pdfDoc.getForm();
                
                // Carrega a fonte Helvetica Bold para usar no campo líquido
                const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
                
                // Preenchendo os campos fornecidos
                try { form.getTextField('cnpj').setText(item.cnpj); } catch(e) {}
                try { 
                    let enderecoFormatado = item.endereco || '';
                    // O endereço vem no formato: "Rua, nº - complemento, Bairro, Cidade - Estado, CEP"
                    // Queremos pegar apenas até a Cidade.
                    if (enderecoFormatado) {
                        const partes = enderecoFormatado.split(' - ');
                        if (partes.length >= 2) {
                            // Pega tudo antes do último " - " (que separa Cidade de Estado)
                            // Se houver complemento com " - ", precisamos ter cuidado.
                            // Uma forma mais segura é dividir por vírgula, já que o formato é:
                            // Rua, nº, Bairro, Cidade - Estado, CEP
                            const partesVirgula = enderecoFormatado.split(',');
                            if (partesVirgula.length >= 4) {
                                // Pega até a cidade (índice 3)
                                const cidadeEstado = partesVirgula[3].split(' - ');
                                const cidade = cidadeEstado[0];
                                enderecoFormatado = `${partesVirgula[0]}, ${partesVirgula[1]}, ${partesVirgula[2]}, ${cidade}`.trim();
                            }
                        }
                    }
                    form.getTextField('endereco').setText(enderecoFormatado); 
                } catch(e) {}
                try { 
                    const razaoSocialField = form.getTextField('razao_social');
                    razaoSocialField.setText(item.razaoSocial || item.nomeFantasia); 
                    // Força um tamanho de fonte bem menor para a Razão Social
                    razaoSocialField.setFontSize(8);
                    
                    // Tenta aumentar a largura do campo (widget) para caber mais texto
                    try {
                        const widgets = razaoSocialField.getWidgets();
                        if (widgets && widgets.length > 0) {
                            const widget = widgets[0];
                            const rect = widget.getRectangle();
                            // Aumenta a largura do campo em 150 pontos (ajuste conforme necessário)
                            widget.setRectangle({
                                x: rect.x,
                                y: rect.y,
                                width: rect.width + 150,
                                height: rect.height
                            });
                        }
                    } catch (e) {
                        console.warn("Não foi possível redimensionar o campo razao_social", e);
                    }
                } catch(e) {}
                try { form.getTextField('nome_cliente').setText(item.nomeFantasia); } catch(e) {}
                try { form.getTextField('Total_Proventos').setText(item.salarioMinimo.toFixed(2).replace('.', ',')); } catch(e) {}
                try { form.getTextField('proventos').setText(item.salarioMinimo.toFixed(2).replace('.', ',')); } catch(e) {}
                try { 
                    const liquidoField = form.getTextField('liquido_receber');
                    liquidoField.setText(item.valorLiquido.toFixed(2).replace('.', ',')); 
                    
                    // Aplica a fonte em negrito ao campo
                    liquidoField.updateAppearances(helveticaBoldFont);
                } catch(e) {}
                try { form.getTextField('dias_referentes').setText('30'); } catch(e) {}
                try { form.getTextField('mes_ano_referente').setText(item.mesAno); } catch(e) {}
                
                // Preenchendo campos de INSS se houver desconto
                if (item.valorInss > 0) {
                    try { form.getTextField('cod_inss').setText('3'); } catch(e) {} // Código genérico para INSS, ajuste se necessário
                    try { form.getTextField('descricao_inss').setText('INSS'); } catch(e) {}
                    try { form.getTextField('referencia_inss').setText(`${item.inssPerc}%`); } catch(e) {}
                    try { form.getTextField('valor_inss').setText(item.valorInss.toFixed(2).replace('.', ',')); } catch(e) {}
                    try { form.getTextField('total_desconto').setText(item.valorInss.toFixed(2).replace('.', ',')); } catch(e) {}
                } else {
                    // Limpa os campos caso não tenha INSS (útil se o template vier com algum valor padrão)
                    try { form.getTextField('cod_inss').setText(''); } catch(e) {}
                    try { form.getTextField('descricao_inss').setText(''); } catch(e) {}
                    try { form.getTextField('referencia_inss').setText(''); } catch(e) {}
                    try { form.getTextField('valor_inss').setText(''); } catch(e) {}
                    try { form.getTextField('total_desconto').setText(''); } catch(e) {}
                }
                
                form.flatten();
                return await pdfDoc.save();
                
            } catch (e) {
                console.warn("Template não encontrado ou erro ao preencher, gerando em branco.", e);
                const pdfDocBlank = await PDFDocument.create();
                const page = pdfDocBlank.addPage([595, 842]); // A4
                page.drawText(`RECIBO DE PRO-LABORE - ${item.mesAno}`, { x: 50, y: 780, size: 20 });
                page.drawText(`Empresa: ${item.nomeFantasia}`, { x: 50, y: 740, size: 14 });
                page.drawText(`CNPJ: ${item.cnpj}`, { x: 50, y: 720, size: 14 });
                page.drawText(`Salário Base: R$ ${item.salarioMinimo.toFixed(2)}`, { x: 50, y: 680, size: 12 });
                page.drawText(`INSS Retido: R$ ${item.valorInss.toFixed(2)}`, { x: 50, y: 660, size: 12 });
                page.drawText(`Líquido a Receber: R$ ${item.valorLiquido.toFixed(2)}`, { x: 50, y: 640, size: 14 });
                return await pdfDocBlank.save();
            }
        } catch (error) {
            console.error("Erro ao gerar PDF individual:", error);
            return null;
        }
    };

    const handleDownloadSingle = async (item: ProLabore) => {
        setIsGeneratingPdf(item.id);
        try {
            const pdfBytes = await generateSinglePdf(item);
            if (!pdfBytes) throw new Error("Falha ao gerar bytes do PDF");

            const fileName = `Holerite_${item.nomeFantasia.replace(/[^a-z0-9]/gi, '_')}_${item.mesAno.replace('/', '-')}.pdf`;
            const result = await window.api.savePdf(pdfBytes, fileName);
            
            if (result.success) {
                // Sucesso silencioso ou toast
            } else if (!result.canceled) {
                alert('Erro ao salvar PDF: ' + result.error);
            }
        } catch (error) {
            console.error(error);
            alert('Ocorreu um erro gerando o PDF do holerite.');
        } finally {
            setIsGeneratingPdf(null);
        }
    };

    const handleDownloadBatch = async () => {
        if (selectedItems.size === 0) return;
        
        setIsGeneratingPdf('batch');
        try {
            const itemsToDownload = proLabores.filter(item => selectedItems.has(item.id));
            
            // Criar um novo documento PDF que vai juntar todos
            const mergedPdf = await PDFDocument.create();
            
            for (const item of itemsToDownload) {
                const pdfBytes = await generateSinglePdf(item);
                if (pdfBytes) {
                    const pdfToMerge = await PDFDocument.load(pdfBytes);
                    const copiedPages = await mergedPdf.copyPages(pdfToMerge, pdfToMerge.getPageIndices());
                    copiedPages.forEach((page) => mergedPdf.addPage(page));
                }
            }
            
            const mergedPdfBytes = await mergedPdf.save();
            const fileName = `Holerites_Lote_${filterMonth.replace('/', '-')}.pdf`;
            
            const result = await window.api.savePdf(mergedPdfBytes, fileName);
            
            if (result.success) {
                setSelectedItems(new Set()); // Limpa seleção após sucesso
            } else if (!result.canceled) {
                alert('Erro ao salvar PDF em lote: ' + result.error);
            }
            
        } catch (error) {
            console.error("Erro no download em lote:", error);
            alert('Ocorreu um erro ao gerar o PDF em lote.');
        } finally {
            setIsGeneratingPdf(null);
        }
    };

    const handleDeleteBatch = async () => {
        if (selectedItems.size === 0) return;
        
        setIsLoading(true);
        setDeleteModal({ isOpen: false, type: 'batch' });
        try {
            const batch = writeBatch(db);
            
            selectedItems.forEach(id => {
                const docRef = doc(db, 'pro_labores', id);
                batch.delete(docRef);
            });

            await batch.commit();
            
            // Atualiza a lista localmente
            setProLabores(prev => prev.filter(item => !selectedItems.has(item.id)));
            setSelectedItems(new Set());
            
        } catch (error) {
            console.error("Erro ao excluir holerites:", error);
            alert('Ocorreu um erro ao excluir os holerites selecionados.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDeleteSingle = async (id: string) => {
        setIsLoading(true);
        setDeleteModal({ isOpen: false, type: 'single' });
        try {
            await deleteDoc(doc(db, 'pro_labores', id));
            setProLabores(prev => prev.filter(item => item.id !== id));
            
            // Se o item excluído estava selecionado, remove da seleção
            if (selectedItems.has(id)) {
                const newSelected = new Set(selectedItems);
                newSelected.delete(id);
                setSelectedItems(newSelected);
            }
        } catch (error) {
            console.error("Erro ao excluir holerite:", error);
            alert('Ocorreu um erro ao excluir o holerite.');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 h-full flex flex-col">
            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-5 rounded-2xl shadow-sm border border-slate-100 shrink-0">
                <div>
                    <h1 className="text-xl font-bold tracking-tight text-slate-900 group flex items-center gap-2">
                        <div className="bg-indigo-100 text-indigo-600 p-1.5 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            <FileBadge className="w-5 h-5" />
                        </div>
                        Emissão de Holerites
                    </h1>
                    <p className="text-slate-500 text-sm mt-0.5">Visualize e emita os recibos de pró-labore gerados</p>
                </div>

                <div className="flex items-center gap-3 w-full sm:w-auto">
                    <MonthPicker
                        value={filterMonth}
                        onChange={setFilterMonth}
                        accent="indigo"
                    />
                </div>
            </div>

            {/* Main Content Area */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex flex-col overflow-hidden flex-1 min-h-0">
                
                {/* Toolbar */}
                <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/50">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Buscar empresa ou CNPJ..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-md text-xs focus:ring-2 focus:ring-indigo-500 outline-none w-full sm:w-64 transition-shadow"
                            />
                        </div>
                        
                        {selectedItems.size > 0 && (
                            <div className="flex items-center gap-2 animate-in fade-in slide-in-from-left-2">
                                <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                                    {selectedItems.size} selecionados
                                </span>
                                <button
                                    onClick={handleDownloadBatch}
                                    disabled={isGeneratingPdf === 'batch'}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-md text-xs font-medium transition-colors shadow-sm shadow-indigo-200 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                                >
                                    {isGeneratingPdf === 'batch' ? (
                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                        <Download className="w-3.5 h-3.5" />
                                    )}
                                    Baixar Lote
                                </button>
                                <button
                                    onClick={() => setDeleteModal({ isOpen: true, type: 'batch' })}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 rounded-md text-xs font-medium transition-colors shadow-sm cursor-pointer"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    Excluir
                                </button>
                            </div>
                        )}
                    </div>
                    
                    <div className="text-xs text-slate-500 font-medium flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5" />
                        Total: {filteredProLabores.length} registros
                    </div>
                </div>

                {/* Table Area */}
                <div className="flex-1 overflow-auto p-1">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2">
                            <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                            <p className="text-sm">Buscando registros de {filterMonth}...</p>
                        </div>
                    ) : filteredProLabores.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full text-slate-400 space-y-2 p-6 text-center">
                            <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-1">
                                <FileBadge className="w-6 h-6 text-slate-300" />
                            </div>
                            <p className="text-base font-medium text-slate-600">Nenhum holerite encontrado</p>
                            <p className="text-xs">Não há registros gerados para a competência {filterMonth} ou para a sua busca.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left text-xs">
                            <thead className="sticky top-0 bg-white/90 backdrop-blur-sm z-10 shadow-sm">
                                <tr className="text-slate-500 font-medium border-b border-slate-100">
                                    <th className="p-3 w-10 text-center">
                                        <button 
                                            onClick={handleSelectAll}
                                            className="text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                                        >
                                            {selectedItems.size === filteredProLabores.length && filteredProLabores.length > 0 ? (
                                                <CheckSquare className="w-4 h-4 text-indigo-600" />
                                            ) : (
                                                <Square className="w-4 h-4" />
                                            )}
                                        </button>
                                    </th>
                                    <th className="p-3">Empresa</th>
                                    <th className="p-3">CNPJ</th>
                                    <th className="p-3 text-right">Líquido (R$)</th>
                                    <th className="p-3 text-right">Ações</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredProLabores.map((item) => (
                                    <tr 
                                        key={item.id} 
                                        onClick={() => toggleItem(item.id)}
                                        className={cn(
                                            "group cursor-pointer transition-colors hover:bg-slate-50",
                                            selectedItems.has(item.id) ? "bg-indigo-50/30" : ""
                                        )}
                                    >
                                        <td className="p-3 text-center">
                                            <button 
                                                onClick={(e) => { e.stopPropagation(); toggleItem(item.id); }}
                                                className="text-slate-300 group-hover:text-indigo-400 transition-colors cursor-pointer"
                                            >
                                                {selectedItems.has(item.id) ? (
                                                    <CheckSquare className="w-4 h-4 text-indigo-600" />
                                                ) : (
                                                    <Square className="w-4 h-4" />
                                                )}
                                            </button>
                                        </td>
                                        <td className="p-3">
                                            <div className="font-semibold text-slate-900 group-hover:text-indigo-700 transition-colors">{item.nomeFantasia}</div>
                                            <div className="text-[10px] text-slate-500 mt-0.5">Base: R$ {item.salarioMinimo.toFixed(2)}</div>
                                        </td>
                                        <td className="p-3 font-mono text-slate-600">{item.cnpj}</td>
                                        <td className="p-3 font-bold text-slate-800 text-right">
                                            R$ {item.valorLiquido.toFixed(2)}
                                        </td>
                                        <td className="p-3 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDownloadSingle(item); }}
                                                    disabled={isGeneratingPdf === item.id || isGeneratingPdf === 'batch'}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-200 text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 rounded-md transition-all font-medium disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                                                >
                                                    {isGeneratingPdf === item.id ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                                    ) : (
                                                        <Download className="w-3.5 h-3.5" />
                                                    )}
                                                    Baixar
                                                </button>
                                                <button
                                                    onClick={(e) => { 
                                                        e.stopPropagation(); 
                                                        setDeleteModal({ isOpen: true, type: 'single', id: item.id });
                                                    }}
                                                    className="inline-flex items-center justify-center w-7 h-7 bg-white border border-slate-200 text-slate-400 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 rounded-md transition-all cursor-pointer"
                                                    title="Excluir holerite"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Modal de Confirmação de Exclusão */}
            {deleteModal.isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-6">
                            <div className="flex items-center gap-4 mb-4">
                                <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                                    <AlertCircle className="w-6 h-6 text-rose-600" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-slate-900">
                                        Confirmar Exclusão
                                    </h3>
                                    <p className="text-sm text-slate-500 mt-1">
                                        {deleteModal.type === 'batch' 
                                            ? `Tem certeza que deseja excluir os ${selectedItems.size} holerites selecionados?`
                                            : 'Tem certeza que deseja excluir este holerite?'}
                                    </p>
                                </div>
                            </div>
                            <div className="bg-rose-50 p-4 rounded-xl border border-rose-100 mb-6">
                                <p className="text-sm text-rose-800">
                                    Esta ação não pode ser desfeita. Os dados serão removidos permanentemente.
                                </p>
                            </div>
                            <div className="flex items-center justify-end gap-3">
                                <button
                                    onClick={() => setDeleteModal({ isOpen: false, type: 'single' })}
                                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={() => {
                                        if (deleteModal.type === 'batch') {
                                            handleDeleteBatch();
                                        } else if (deleteModal.id) {
                                            handleDeleteSingle(deleteModal.id);
                                        }
                                    }}
                                    className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-sm shadow-rose-200 cursor-pointer"
                                >
                                    Excluir
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
