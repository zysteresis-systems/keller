import { X, History, ExternalLink } from 'lucide-react';

const RELEASES = [
  {
    version: 'v0.3.2',
    date: 'April 15, 2026',
    title: 'AI Insights Bug Fix & Enhanced Error Handling',
    changes: [
      'Fixed "bad groq request" error in AI insights feature',
      'Added robust DeepSeek API integration with Groq fallback',
      'Implemented intelligent mock responses for development/testing',
      'Enhanced error handling with graceful degradation',
      'Added smart log analysis with metric extraction (wires, cells, problems)',
      'Improved user experience with contextual error messages'
    ]
  },
  {
    version: 'v0.3.1',
    date: 'April 15, 2026',
    title: 'Enhanced AI Insights & DeepSeek Integration',
    changes: [
      'Enhanced AI log analysis with DeepSeek API integration for better explanations',
      'Improved error interpretation for synthesis and simulation failures',
      'Added detailed metric extraction (power, timing, area estimates)',
      'Optimized prompt engineering for beginner-friendly explanations'
    ]
  },
  {
    version: 'v0.3',
    date: 'April 2026',
    title: 'AI Insights & Custom ABC Sequences',
    changes: [
      'Added Groq Llama-3 integeration for one-click EDA log explanations (AI Insights)',
      'Added Custom Recipe support using OpenABC-D 20-number sequences',
      'Fixed Sky130 PDK netlist visualization (generic element mapping)',
      'Added Changelog and refined UI cosmetics based on user feedback'
    ]
  },
  {
    version: 'v0.2',
    date: 'April 2026',
    title: 'Cloud Deployment & Sky130 Integration',
    changes: [
      'Integrated Sky130 HD PDK liberty file for realistic technology mapping',
      'Added Interactive Netlist SVG Schematic viewer with ElkJS',
      'Deployed application on Render using custom Docker container with Icarus Verilog',
      'Added built-in dynamic synthesis recipes (Quick, Standard, Aggressive, Area Min)'
    ]
  },
  {
    version: 'v0.1',
    date: 'April 2026',
    title: 'MVP Initialization',
    changes: [
      'Created browser-native EDA sandbox interface',
      'Compiled Yosys to WASM (@yowasp/yosys) for client/server synthesis',
      'Implemented basic Icarus Verilog simulation pipeline with VCD extraction',
      'Integrated Monaco Editor for Verilog and Testbench authoring',
      'Added custom waveform viewer'
    ]
  }
];

export default function ChangelogModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-keller-surface border border-keller-border rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-keller-border">
          <div className="flex items-center gap-2 text-keller-text font-medium text-lg">
            <History className="w-5 h-5 text-keller-accent" />
            Keller Changelog
          </div>
          <button onClick={onClose} className="p-1 text-keller-dim hover:text-keller-text transition-colors rounded">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto font-sans leading-relaxed flex-1 space-y-8">
          {RELEASES.map((release, i) => (
            <div key={i} className="relative pl-6 border-l border-keller-border/50">
              <div className="absolute w-3 h-3 bg-keller-accent rounded-full -left-[6.5px] top-1.5 shadow-[0_0_8px_rgba(78,201,176,0.4)]" />
              <div className="flex items-baseline justify-between mb-2">
                <h3 className="text-keller-text font-semibold text-base flex items-center gap-2">
                  {release.version} <span className="text-keller-dim text-xs font-normal">— {release.title}</span>
                </h3>
                <span className="text-keller-dim text-xs font-mono">{release.date}</span>
              </div>
              <ul className="space-y-1.5">
                {release.changes.map((change, j) => (
                  <li key={j} className="text-sm text-keller-muted flex items-start gap-2">
                    <span className="text-keller-dim mt-0.5">•</span>
                    {change}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
