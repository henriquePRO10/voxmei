import { useState, useEffect } from 'react';
import { FileBadge, Download, Search } from 'lucide-react';
import { collection, getDocs, query, orderBy, where, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { PDFDocument } from 'pdf-lib';
import { format } from 'date-fns';
import { useAuth } from '../contexts/AuthContext';

interface ProLabore {
    id: string;
    clienteId: string;
    nomeFantasia: string;
    cnpj: string;
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
    const [isGeneratingPdf, setIsGeneratingPdf] = useState<string | null>(null);
    const { currentUser } = useAuth();

    const fetchProLabores = async () => {
        if (!currentUser) return;
        try {
            const q = query(
                collection(db, 'pro_labores'),
                where('userId', '==', currentUser.uid),
                where('mesAno', '==', filterMonth)
            );
            const querySnapshot = await getDocs(q);
            const data = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as ProLabore[];
            setProLabores(data);
        } catch (error) {
            console.error("Erro ao buscar pró-labores:", error);
        }
    };

    useEffect(() => {
        if (filterMonth.length === 7) {
            fetchProLabores();
        }
    }, [filterMonth, currentUser]);

    const handleGeneratePdf = async (item: ProLabore) => {
        setIsGeneratingPdf(item.id);
        try {
            // Tenta ler o PDF Template armazenado na pasta public ou assets.
            // Em Vite, arquivos estáticos globais ficam na pasta public/.
            let pdfBytes: ArrayBuffer;
            try {
                const url = new URL('../assets/holerite-template.pdf', import.meta.url).href;
                const res = await fetch(url);
                if (!res.ok) throw new Error('Template não encontrado');
                pdfBytes = await res.arrayBuffer();
            } catch (e) {
                // Fallback: Se o usuário não colocou o PDF de formulário, geramos um em branco
                // com as informações desenhadas diretamente no documento usando os métodos de draw.
                const pdfDocBlank = await PDFDocument.create();
                const page = pdfDocBlank.addPage([595, 842]); // A4
                page.drawText(`RECIBO DE PRO-LABORE - ${item.mesAno}`, { x: 50, y: 780, size: 20 });
                page.drawText(`Empresa: ${item.nomeFantasia}`, { x: 50, y: 740, size: 14 });
                page.drawText(`CNPJ: ${item.cnpj}`, { x: 50, y: 720, size: 14 });
                page.drawText(`Salário Base: R$ ${item.salarioMinimo.toFixed(2)}`, { x: 50, y: 680, size: 12 });
                page.drawText(`INSS Retido: R$ ${item.valorInss.toFixed(2)}`, { x: 50, y: 660, size: 12 });
                page.drawText(`Líquido a Receber: R$ ${item.valorLiquido.toFixed(2)}`, { x: 50, y: 640, size: 14 });
                pdfBytes = await pdfDocBlank.save();
            }

            // Se acharmos o template PDF preenchível, este bloco faria o preenchimento:
            // const pdfDoc = await PDFDocument.load(pdfBytes);
            // const form = pdfDoc.getForm();
            // form.getTextField('CompanyName').setText(item.nomeFantasia);
            // form.getTextField('CNPJ').setText(item.cnpj);
            // form.getTextField('ReferenceMonth').setText(item.mesAno);
            // form.flatten();
            // pdfBytes = await pdfDoc.save();

            // Convertendo ArrayBuffer para Uint8Array para cruzar a ponte IPC Segura
            const uint8Array = new Uint8Array(pdfBytes);

            const fileName = `Holerite_${item.nomeFantasia.replace(/[^a-z0-9]/gi, '_')}_${item.mesAno.replace('/', '-')}.pdf`;

            const result = await window.api.savePdf(uint8Array, fileName);
            if (result.success) {
                alert('PDF salvo com sucesso!');
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

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 group flex items-center gap-3">
                        <div className="bg-indigo-100 text-indigo-600 p-2 rounded-xl group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                            <FileBadge className="w-6 h-6" />
                        </div>
                        Gerador de Holerites
                    </h1>
                    <p className="text-slate-500 mt-1">Gere o PDF final para os seus MEIs</p>
                </div>

                <div className="flex bg-slate-50 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="pl-4 py-2 flex items-center">
                        <Search className="w-5 h-5 text-slate-400" />
                    </div>
                    <input
                        value={filterMonth}
                        onChange={(e) => setFilterMonth(e.target.value)}
                        placeholder="MM/AAAA"
                        maxLength={7}
                        className="px-3 py-2 w-32 bg-transparent outline-none text-slate-700 font-medium"
                    />
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                <table className="w-full text-left text-sm text-slate-600">
                    <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-semibold border-b border-slate-100">
                        <tr>
                            <th className="px-6 py-4">Empresa</th>
                            <th className="px-6 py-4">CPNJ</th>
                            <th className="px-6 py-4 font-right">Líquido (R$)</th>
                            <th className="px-6 py-4 text-right">Ações</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {proLabores.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                    Nenhum pró-labore cadastrado ou gerado em {filterMonth}.
                                </td>
                            </tr>
                        ) : null}
                        {proLabores.map((item) => (
                            <tr key={item.id} className="hover:bg-slate-50/80 transition-colors group">
                                <td className="px-6 py-4">
                                    <div className="font-semibold text-slate-900">{item.nomeFantasia}</div>
                                    <div className="text-xs text-slate-500">Competência: {item.mesAno}</div>
                                </td>
                                <td className="px-6 py-4 font-medium">{item.cnpj}</td>
                                <td className="px-6 py-4 font-bold text-slate-800">
                                    R$ {item.valorLiquido.toFixed(2)}
                                </td>
                                <td className="px-6 py-4 text-right flex justify-end gap-2">
                                    <button
                                        onClick={() => handleGeneratePdf(item)}
                                        disabled={isGeneratingPdf === item.id}
                                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white hover:shadow-lg hover:shadow-indigo-500/30 rounded-lg transition-all font-medium disabled:opacity-50 disabled:hover:bg-indigo-50 disabled:hover:text-indigo-700"
                                    >
                                        {isGeneratingPdf === item.id ? (
                                            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                                        ) : (
                                            <Download className="w-4 h-4" />
                                        )}
                                        Baixar PDF
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
