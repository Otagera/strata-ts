import { type ClassValue, clsx } from "clsx";
import React from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export const SidebarItem = ({ icon: Icon, label, active, onClick }: any) => (
	<button
		onClick={onClick}
		className={cn(
			"w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors",
			active
				? "bg-active-tab text-white border-r-2 border-green-500"
				: "text-spacetime-dim hover:text-white",
		)}
	>
		<Icon size={18} />
		<span>{label}</span>
	</button>
);

export const StatCard = ({ label, value, icon: Icon }: any) => (
	<div className="bg-[#161b22] border border-[#30363d] p-4 rounded-md">
		<div className="flex items-center justify-between mb-2">
			<span className="text-xs text-spacetime-dim uppercase tracking-wider">
				{label}
			</span>
			<Icon size={14} className="text-spacetime-dim" />
		</div>
		<div className="text-xl font-bold">{value}</div>
	</div>
);
