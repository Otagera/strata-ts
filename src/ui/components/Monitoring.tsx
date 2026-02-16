import { Activity, Zap } from "lucide-react";
import React from "react";

export const Monitoring = ({ status, onSeed }: any) => {
	return (
		<div className="p-8 space-y-8">
			<div className="grid grid-cols-2 gap-8">
				<div className="bg-[#161b22] p-6 rounded-xl border border-spacetime">
					<h3 className="text-sm font-bold mb-4 flex items-center gap-2 uppercase tracking-widest">
						<Zap size={14} /> Engine Metrics
					</h3>
					<div className="space-y-4">
						<div className="flex justify-between text-xs">
							<span className="text-spacetime-dim">MemTable Items</span>
							<span>{status?.memTableSize}</span>
						</div>
						<div className="flex justify-between text-xs">
							<span className="text-spacetime-dim">Total SSTables</span>
							<span>{status?.sstCount}</span>
						</div>
					</div>
				</div>
				<div className="bg-[#161b22] p-6 rounded-xl border border-spacetime">
					<h3 className="text-sm font-bold mb-4 flex items-center gap-2 uppercase tracking-widest text-green-500">
						<Activity size={14} /> System Actions
					</h3>
					<button
						onClick={onSeed}
						className="w-full py-2 bg-green-600/10 border border-green-600/50 hover:bg-green-600/20 text-green-500 rounded text-xs font-bold transition-all"
					>
						Seed Demo Data
					</button>
				</div>
			</div>
		</div>
	);
};
