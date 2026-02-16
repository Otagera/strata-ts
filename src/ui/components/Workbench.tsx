import { Activity } from "lucide-react";
import React, { useEffect, useRef } from "react";
import { cn } from "./Common";

export const CommandLog = ({ logs }: { logs: any[] }) => {
	const endRef = useRef<HTMLDivElement>(null);
	useEffect(
		() => endRef.current?.scrollIntoView({ behavior: "smooth" }),
		[logs],
	);

	return (
		<div className="flex-1 overflow-y-auto font-mono text-xs p-4 space-y-2 bg-[#090c10]">
			{logs.map((log, i) => (
				<div key={i} className="flex gap-2">
					<span className="text-spacetime-dim">
						[{new Date(log.timestamp).toLocaleTimeString()}]
					</span>
					<span
						className={cn(
							log.event.includes("error") ? "text-red-400" : "text-green-400",
						)}
					>
						{log.event}:
					</span>
					<span className="text-gray-300">{JSON.stringify(log.data)}</span>
				</div>
			))}
			<div ref={endRef} />
		</div>
	);
};

export const Workbench = ({
	query,
	setQuery,
	handleRun,
	results,
	executeMutation,
	logs,
}: any) => {
	return (
		<div className="flex-1 flex flex-col overflow-hidden h-full">
			<div className="h-1/2 border-b border-spacetime flex flex-col">
				<div className="bg-[#161b22] px-4 py-1 flex items-center justify-between border-b border-spacetime">
					<span className="text-[10px] text-spacetime-dim uppercase tracking-wider">
						SQL / Doc Command Editor
					</span>
					<div className="flex gap-2">
						<span className="text-[10px] text-spacetime-dim">
							Ctrl + Enter to run
						</span>
					</div>
				</div>
				<textarea
					value={query}
					onChange={(e) => setQuery(e.target.value)}
					onKeyDown={(e) => {
						if (e.ctrlKey && e.key === "Enter") handleRun();
					}}
					className="flex-1 bg-[#0d1117] p-4 font-mono text-sm focus:outline-none resize-none text-green-500"
					placeholder="SELECT * FROM users; or INSERT items {'name': 'pill'}..."
				/>
				<div className="p-2 bg-[#161b22] border-t border-spacetime flex justify-end">
					<button
						onClick={handleRun}
						disabled={executeMutation.isPending}
						className="flex items-center gap-2 px-6 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-xs font-bold"
					>
						{executeMutation.isPending ? "Executing..." : "Run Command"}
					</button>
				</div>
			</div>

			<div className="flex-1 flex divide-x divide-spacetime overflow-hidden">
				<div className="flex-1 flex flex-col bg-spacetime overflow-hidden">
					<div className="bg-[#161b22] px-4 py-1 border-b border-spacetime text-[10px] text-spacetime-dim uppercase tracking-wider">
						Results {results?.duration !== undefined && `(${results.duration.toFixed(2)}ms)`}
					</div>
					<div className="flex-1 p-4 overflow-auto font-mono text-xs">
						{executeMutation.isError && (
							<div className="text-red-400">
								Error: {(executeMutation.error as any).message}
							</div>
						)}
						{results?.success === false && (
							<div className="text-red-400">
								Execution Error: {results.error}
							</div>
						)}
						{results?.success && (
							<pre className="text-gray-300">
								{Array.isArray(results.result) && results.result.length > 0
									? JSON.stringify(results.result, null, 2)
									: "Query executed successfully. No rows returned."}
							</pre>
						)}
						{!results && !executeMutation.isPending && (
							<div className="text-spacetime-dim italic">
								Waiting for command...
							</div>
						)}
					</div>
				</div>

				<div className="w-1/3 flex flex-col bg-[#090c10]">
					<div className="bg-[#161b22] px-4 py-1 border-b border-spacetime text-[10px] text-spacetime-dim uppercase tracking-wider flex items-center gap-2">
						<Activity size={10} /> Live Logs
					</div>
					<CommandLog logs={logs} />
				</div>
			</div>
		</div>
	);
};
