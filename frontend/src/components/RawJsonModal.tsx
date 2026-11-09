'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Braces, Check, Copy, Download, Search, X } from 'lucide-react';
import { safeJsonStringify } from '@/lib/telemetry-engine';

interface RawJsonModalProps {
  isOpen: boolean;
  title: string;
  payload: any;
  onClose: () => void;
}

export default function RawJsonModal({
  isOpen,
  title,
  payload,
  onClose,
}: RawJsonModalProps) {
  const [copied, setCopied] = useState(false);
  const [filterText, setFilterText] = useState('');

  if (!isOpen) return null;

  const formattedJson = safeJsonStringify(
    payload !== undefined && payload !== null
      ? payload
      : { message: 'No JSON payload available for this selection.' }
  );

  const lines = formattedJson.split('\n');
  const filteredLines = filterText.trim()
    ? lines.filter((l) => l.toLowerCase().includes(filterText.trim().toLowerCase()))
    : lines;

  const handleCopy = () => {
    navigator.clipboard.writeText(formattedJson);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const handleDownload = () => {
    const blob = new Blob([formattedJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `antigravity-telemetry-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[9999] bg-[#03050a]/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6"
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 12 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-[#0b0f1b] border border-blue-500/40 rounded-2xl w-full max-w-5xl max-h-[86vh] flex flex-col shadow-[0_25px_70px_-12px_rgba(0,0,0,0.9)] overflow-hidden"
        >
          {/* Modal Header */}
          <div className="px-5 py-3.5 border-b border-white/[0.09] bg-[#070a12] flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <span className="px-2 py-0.5 rounded-md text-[10px] font-mono uppercase bg-blue-500/20 text-blue-300 border border-blue-500/40 shrink-0 flex items-center gap-1">
                <Braces className="w-3 h-3" />
                Raw JSON
              </span>
              <h3 className="text-xs sm:text-sm font-mono font-semibold text-white truncate">
                {title || 'Payload'}
              </h3>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <div className="relative hidden sm:block w-52">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={filterText}
                  onChange={(e) => setFilterText(e.target.value)}
                  placeholder="Filter lines..."
                  className="w-full pl-8 pr-6 py-1 rounded-lg bg-[#0d1220] border border-white/[0.08] text-xs font-mono text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                {filterText && (
                  <button
                    onClick={() => setFilterText('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleDownload}
                className="px-2.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-slate-200 text-xs font-mono transition flex items-center gap-1 cursor-pointer"
                title="Download JSON"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden md:inline">Export</span>
              </button>

              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1 rounded-lg bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border border-blue-500/40 text-xs font-mono font-medium transition flex items-center gap-1.5 cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy JSON'}</span>
              </button>

              <button
                type="button"
                onClick={onClose}
                className="px-2.5 py-1 rounded-lg bg-white/[0.08] text-slate-200 hover:text-white hover:bg-white/[0.15] text-xs font-mono transition flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Close</span>
              </button>
            </div>
          </div>

          {/* Modal Body */}
          <div className="p-5 overflow-y-auto overflow-x-auto flex-1 bg-[#05070d] text-blue-100 font-mono text-xs leading-relaxed">
            <pre className="whitespace-pre-wrap break-words select-all m-0">
              {filteredLines.join('\n')}
            </pre>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
