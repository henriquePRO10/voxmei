import { useState, useEffect } from 'react';
import { Settings, PlayCircle, Loader2, CheckCircle2 } from 'lucide-react';
import { collection, getDocs, writeBatch, doc, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { useAuth } from '../contexts/AuthContext';

interface ConfigValues {
    salarioMinimo: number;
    inssPerc: number;
}

export function ProLabore() {
    const [isGenerating, setIsGenerating] = useState(false);
    const [success, setSuccess] = useState(false);
    const currentMonth = format(new Date(), 'MM/yyyy');
    const { currentUser } = useAuth();

    const { register, watch } = useForm<ConfigValues>({
        defaultValues: { salarioMinimo: 1412.00, inssPerc: 11 }
    });

    const base = Number(watch('salarioMinimo') || 0);
    const inss = Number(watch('inssPerc') || 0);
    const calcInss = (base * inss) / 100;
    const liquido = base - calcInss;

    const handleGenerateValues = async () => {
        if (!currentUser) return;
        setIsGenerating(true);
        setSuccess(false);
        try {
            // Get all active clients of the current user
            const q = query(
                collection(db, 'clientes'),
                where('userId', '==', currentUser.uid),
                where('status', '==', 'Ativo')
            );
            const activeClients = await getDocs(q);

            if (activeClients.empty) {
                alert("Nenhum cliente ativo encontrado para gerar pró-labore.");
                setIsGenerating(false);
                return;
            }

            // Check if already generated for this month
            const q2 = query(
                collection(db, 'pro_labores'),
                where('userId', '==', currentUser.uid),
                where('mesAno', '==', currentMonth)
            );
            const existing = await getDocs(q2);
            if (!existing.empty) {
                if (!confirm(`Já existem pró-labores gerados para ${currentMonth}. Deseja gerar novamente?`)) {
                    setIsGenerating(false);
                    return;
                }
            }

            const batch = writeBatch(db);

            activeClients.docs.forEach((clientDoc) => {
                const ref = doc(collection(db, 'pro_labores'));
                batch.set(ref, {
                    clienteId: clientDoc.id,
                    nomeFantasia: clientDoc.data().nomeFantasia,
                    cnpj: clientDoc.data().cnpj,
                    mesAno: currentMonth,
                    salarioMinimo: base,
                    inssPerc: inss,
                    valorInss: calcInss,
                    valorLiquido: liquido,
                    userId: currentUser.uid,
                    geradoEm: Timestamp.now()
                });
            });

            await batch.commit();
            setSuccess(true);
            setTimeout(() => setSuccess(false), 5000);
        } catch (error) {
            console.error("Erro na geração em lote:", error);
            alert("Erro ao processar as folhas.");
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900 group flex items-center gap-3">
                        <div className="bg-blue-100 text-blue-600 p-2 rounded-xl group-hover:bg-blue-600 group-hover:text-white transition-colors">
                            <Settings className="w-6 h-6" />
                        </div>
                        Geração de Pró-Labores
                    </h1>
                    <p className="text-slate-500 mt-1">Configure as bases e rode a folha mensal em lote</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100 relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-8 opacity-5">
                        <Settings className="w-48 h-48" />
                    </div>

                    <h2 className="text-xl font-bold text-slate-800 mb-6 relative z-10">Parâmetros do Mês ({currentMonth})</h2>

                    <div className="space-y-6 relative z-10">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Salário Mínimo Vigente (R$)</label>
                            <input
                                type="number"
                                step="0.01"
                                {...register('salarioMinimo')}
                                className="w-full md:w-2/3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-lg font-mono outline-none transition"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Alíquota INSS MEI (%)</label>
                            <input
                                type="number"
                                {...register('inssPerc')}
                                className="w-full md:w-2/3 px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 text-lg font-mono outline-none transition"
                            />
                        </div>

                        <div className="mt-8 pt-8 border-t border-slate-100 grid grid-cols-2 gap-6">
                            <div>
                                <p className="text-sm font-medium text-slate-500 mb-1">Desconto INSS Estimado</p>
                                <h3 className="text-2xl font-bold text-rose-600 font-mono">
                                    R$ {calcInss.toFixed(2)}
                                </h3>
                            </div>
                            <div>
                                <p className="text-sm font-medium text-slate-500 mb-1">Valor Líquido</p>
                                <h3 className="text-2xl font-bold text-emerald-600 font-mono">
                                    R$ {liquido.toFixed(2)}
                                </h3>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="flex flex-col justify-center items-center bg-slate-900 rounded-3xl p-10 text-center relative overflow-hidden shadow-2xl">
                    <div className="relative z-10 space-y-6 max-w-sm">
                        <div className="mx-auto w-20 h-20 bg-blue-600/20 backdrop-blur-md rounded-2xl flex items-center justify-center -mb-2 shadow-[0_0_30px_rgba(37,99,235,0.3)]">
                            <PlayCircle className="w-10 h-10 text-blue-400" />
                        </div>
                        <h2 className="text-3xl font-bold text-white tracking-tight">Processar Lote</h2>
                        <p className="text-slate-400 font-medium">
                            O sistema irá ler todos os MEIs ativos na base de dados e criar os registros de Holerite para a competência <strong className="text-white bg-slate-800 px-2 py-0.5 rounded-md">{currentMonth}</strong>.
                        </p>

                        <button
                            onClick={handleGenerateValues}
                            disabled={isGenerating || success}
                            className={`w-full py-4 rounded-xl font-bold text-lg shadow-xl transition-all duration-300 flex items-center justify-center gap-3 ${success
                                ? 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-emerald-500/30'
                                : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/30 hover:-translate-y-1'
                                } disabled:opacity-50 disabled:hover:translate-y-0`}
                        >
                            {isGenerating ? (
                                <><Loader2 className="w-6 h-6 animate-spin" /> Processando Carteira...</>
                            ) : success ? (
                                <><CheckCircle2 className="w-6 h-6" /> Lote Processado!</>
                            ) : (
                                'Gerar Pró-Labores Agora'
                            )}
                        </button>
                        <p className="text-xs text-slate-500 mt-4">Esta ação abrirá um Batch Write no Firestore.</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
