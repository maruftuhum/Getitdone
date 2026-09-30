import React, { useState, useEffect } from 'react';
import { 
  Cpu, 
  X, 
  CheckCircle2, 
  Download, 
  Play, 
  HardDrive, 
  Sparkles, 
  Loader2, 
  AlertCircle,
  Smartphone,
  ShieldCheck
} from 'lucide-react';
import { 
  localGemmaEngine, 
  AVAILABLE_LOCAL_MODELS, 
  ModelDownloadProgress 
} from '../services/localGemmaEngine';

interface LocalGemmaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LocalGemmaModal: React.FC<LocalGemmaModalProps> = ({ isOpen, onClose }) => {
  const [selectedModel, setSelectedModel] = useState(localGemmaEngine.getSelectedModelId());
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress>(localGemmaEngine.getProgress());
  const [isWebGPUSupported, setIsWebGPUSupported] = useState(false);
  const [testPrompt, setTestPrompt] = useState('What should I focus on today?');
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isInferencing, setIsInferencing] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsWebGPUSupported(localGemmaEngine.isWebGPUSupported());
      setSelectedModel(localGemmaEngine.getSelectedModelId());
      const unsub = localGemmaEngine.subscribeProgress((p) => setDownloadProgress(p));
      return () => unsub();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleStartDownload = async () => {
    localGemmaEngine.setSelectedModelId(selectedModel);
    await localGemmaEngine.downloadAndLoadModel(selectedModel);
  };

  const handleRunInference = async () => {
    setIsInferencing(true);
    setTestResult(null);
    try {
      const res = await localGemmaEngine.generateResponse(testPrompt, []);
      setTestResult(`${res.reply}\n\n[Engine: ${res.engineUsed}]`);
    } catch (e: any) {
      setTestResult(`Inference Error: ${e.message}`);
    } finally {
      setIsInferencing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-in fade-in">
      <div className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Cpu className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                In-App Local LLM Downloader
              </h3>
              <p className="text-xs text-slate-500">
                Download model directly to your phone — No Termux or setup required
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Highlight Banner: No Termux Needed */}
        <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 flex items-start gap-2.5">
          <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs text-emerald-900 dark:text-emerald-200">
            <span className="font-bold block">100% In-App & Self-Contained</span>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-300 mt-0.5 leading-relaxed">
              You do <strong>not</strong> need Termux, command lines, or external apps. The app downloads the quantized model directly into your device's browser storage and runs it locally on your phone's GPU!
            </p>
          </div>
        </div>

        {/* Model Selection */}
        <div className="space-y-2.5">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
            Choose Model to Download to Phone:
          </label>
          <div className="space-y-2">
            {AVAILABLE_LOCAL_MODELS.map((m) => {
              const isSelected = selectedModel === m.id;
              return (
                <div
                  key={m.id}
                  onClick={() => setSelectedModel(m.id)}
                  className={`p-3 rounded-2xl border cursor-pointer transition-all ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/40 dark:bg-indigo-950/40 shadow-sm'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-900 dark:text-white">
                      {m.name}
                    </span>
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {m.size}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">{m.description}</p>
                  <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-medium block mt-1">
                    {m.recommendedFor}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Download Action & Progress Bar */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                Phone Storage & Caching
              </span>
            </div>

            {downloadProgress.status === 'ready' && (
              <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Model Cached & Ready
              </span>
            )}
          </div>

          {/* Progress Visual */}
          {downloadProgress.status === 'downloading' && (
            <div className="space-y-1.5 animate-in fade-in">
              <div className="flex justify-between text-[11px] text-slate-600 dark:text-slate-300 font-medium">
                <span className="truncate pr-2">{downloadProgress.text || 'Downloading weights...'}</span>
                <span>{Math.round((downloadProgress.progress || 0) * 100)}%</span>
              </div>
              <div className="w-full h-2.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-600 to-violet-600 transition-all duration-300"
                  style={{ width: `${Math.max(5, (downloadProgress.progress || 0) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {downloadProgress.status === 'error' && (
            <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/40 text-[11px] text-amber-800 dark:text-amber-300 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{downloadProgress.text}</span>
            </div>
          )}

          {/* Action Button */}
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={handleStartDownload}
              disabled={downloadProgress.status === 'downloading'}
              className="flex-1 py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs flex items-center justify-center gap-2 transition shadow-sm"
            >
              {downloadProgress.status === 'downloading' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Downloading to Phone ({Math.round((downloadProgress.progress || 0) * 100)}%)...</span>
                </>
              ) : downloadProgress.status === 'ready' ? (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Re-download / Reload Model</span>
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  <span>Download Model to Phone (One-Click)</span>
                </>
              )}
            </button>
          </div>

          <p className="text-[10px] text-slate-500 text-center">
            Downloaded once and permanently cached in your browser. Runs offline without mobile data.
          </p>
        </div>

        {/* Live Test Playground */}
        <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
          <label className="text-xs font-bold text-slate-800 dark:text-slate-200 block">
            Test Local In-Browser Model Inference:
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={testPrompt}
              onChange={(e) => setTestPrompt(e.target.value)}
              placeholder="e.g. Schedule gym tomorrow at 7am..."
              className="flex-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-white"
            />
            <button
              onClick={handleRunInference}
              disabled={isInferencing || !testPrompt.trim()}
              className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow-sm"
            >
              {isInferencing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              <span>Run</span>
            </button>
          </div>

          {testResult && (
            <div className="p-3 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-mono leading-relaxed mt-2 border border-slate-200 dark:border-slate-700">
              {testResult}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
          <span className="text-[11px] text-slate-500">
            WebGPU Status: {isWebGPUSupported ? 'Hardware Accelerated' : 'Offline Engine Active'}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 font-semibold text-xs transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
