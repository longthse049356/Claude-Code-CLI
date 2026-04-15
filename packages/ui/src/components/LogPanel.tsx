import { useEffect, useRef } from "react";
import { useWsStore } from "../stores/useWsStore";

export function LogPanel() {
  const logs = useWsStore((state) => state.logs);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  return (
    <div className="flex flex-col h-full border-t dark:border-slate-800">
      <div className="p-3 border-b dark:border-slate-800 flex justify-between items-center">
        <h3 className="text-sm font-semibold">Logs</h3>
        <span className="text-xs text-slate-500">{logs.length} entries</span>
      </div>

      <div className="flex-1 overflow-y-auto bg-slate-950 text-slate-300 font-mono text-xs">
        {logs.length === 0 ? (
          <p className="p-3 text-slate-500">No logs yet...</p>
        ) : (
          <div className="p-2 space-y-1">
            {logs.map((log, i) => (
              <div key={i} className="whitespace-pre-wrap break-all">
                {log}
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        )}
      </div>
    </div>
  );
}
