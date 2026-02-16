import { Layers, Table as TableIcon } from "lucide-react";
import React from "react";

export const TableView = ({ data }: { data: any[] }) => {
	if (!data || data.length === 0)
		return <div className="text-spacetime-dim p-4">No tables found.</div>;
	return (
		<div className="p-4 space-y-8">
			{data.map((table: any) => (
				<div
					key={table.name}
					className="border border-spacetime rounded-lg overflow-hidden"
				>
					<div className="bg-[#161b22] px-4 py-2 font-bold flex items-center gap-2 border-b border-spacetime">
						<TableIcon size={16} className="text-green-500" /> {table.name}
					</div>
					<table className="w-full text-xs text-left">
						<thead className="bg-[#0d1117] text-spacetime-dim border-b border-spacetime">
							<tr>
								<th className="px-4 py-2">Column</th>
								<th className="px-4 py-2">Type</th>
							</tr>
						</thead>
						<tbody>
							{table.columns.map((col: any) => (
								<tr
									key={col.name}
									className="border-b border-spacetime last:border-0"
								>
									<td className="px-4 py-2 font-mono">{col.name}</td>
									<td className="px-4 py-2 text-spacetime-dim">
										{col.dataType}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			))}
		</div>
	);
};

export const KVExplorer = ({ data }: { data: any[] }) => (
	<div className="p-4">
		<div className="border border-spacetime rounded-lg overflow-hidden">
			<table className="w-full text-xs text-left">
				<thead className="bg-[#161b22] text-spacetime-dim border-b border-spacetime">
					<tr>
						<th className="px-4 py-2">Key</th>
						<th className="px-4 py-2">Value</th>
					</tr>
				</thead>
				<tbody>
					{data?.map((entry: any) => (
						<tr
							key={entry.key}
							className="border-b border-spacetime last:border-0 hover:bg-[#161b22]"
						>
							<td className="px-4 py-2 font-mono text-green-500">
								{decodeURIComponent(entry.key)}
							</td>
							<td className="px-4 py-2 font-mono truncate max-w-xs">
								{entry.value}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	</div>
);

export const CollectionGrid = ({ collections, onSelect }: any) => (
	<div className="p-4 grid grid-cols-3 gap-4">
		{collections?.map((col: string) => (
			<div
				key={col}
				className="bg-[#161b22] border border-spacetime p-4 rounded-lg hover:border-green-500 transition-colors cursor-pointer"
				onClick={() => onSelect(col)}
			>
				<div className="flex items-center gap-2 mb-2">
					<Layers size={16} className="text-green-500" />
					<span className="font-bold">{col}</span>
				</div>
				<div className="text-[10px] text-spacetime-dim">Collection</div>
			</div>
		))}
		{(!collections || collections.length === 0) && (
			<div className="text-spacetime-dim">No collections found.</div>
		)}
	</div>
);
