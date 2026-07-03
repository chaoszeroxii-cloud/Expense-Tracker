import { useState } from "react";
import Icon from "@mdi/react";
import {
  mdiCalendarSync,
  mdiChevronDown,
  mdiChevronUp,
  mdiCheck,
  mdiClose,
} from "@mdi/js";
import clsx from "clsx";
import { allocationsApi } from "../../api";
import { useAllocationPlanPreview } from "../../hooks";
import IconDisplay from "../ui/IconDisplay";
import { useT } from "../../store/i18n.store";

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function ApplyLastMonthPlan({
  unallocated,
  onApplied,
}: {
  unallocated: number;
  onApplied: () => void;
}) {
  const t = useT();
  const { data: preview, loading, refetch } = useAllocationPlanPreview();

  const [open, setOpen] = useState(false);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  if (loading) return null;
  // Hide only when there's truly nothing to fund — NOT when there's no plan
  // history yet. Gating on sourceMonth would mean nobody could ever create
  // the first plan (it's only ever written as a byproduct of this action).
  if (!preview || preview.items.length === 0) return null;

  const isFirstTime = !preview.sourceMonth;

  const startOpen = () => {
    const next: Record<string, string> = {};
    for (const it of preview.items) {
      if (it.suggested > 0) next[it.allocationId] = String(it.suggested);
    }
    setInputs(next);
    setOpen(true);
    setErr("");
  };

  const total = preview.items.reduce(
    (s, it) => s + (Number(inputs[it.allocationId]) || 0),
    0,
  );
  const overCapacity = total > unallocated;

  const handleApply = async () => {
    const amounts = preview.items.map((it) => ({
      allocationId: it.allocationId,
      amount: Number(inputs[it.allocationId]) || 0,
    }));
    setBusy(true);
    setErr("");
    try {
      await allocationsApi.applyPlan(amounts);
      setDone(true);
      setTimeout(() => {
        setDone(false);
        setOpen(false);
        setInputs({});
        refetch();
        onApplied();
      }, 900);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-5 mb-4 animate-fade-up">
      <div className="rounded-2xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 overflow-hidden">
        <button
          onClick={() => (open ? setOpen(false) : startOpen())}
          className="w-full flex items-center gap-3 px-4 py-3 text-left"
        >
          <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-800/50 flex items-center justify-center flex-shrink-0">
            <Icon path={mdiCalendarSync} size={0.75} color="#8b5cf6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-violet-700 dark:text-violet-300">
              {isFirstTime ? t("set_month_plan") : t("apply_last_month_plan")}
            </p>
            <p className="text-xs text-violet-500 dark:text-violet-400">
              {isFirstTime ? t("set_month_plan_desc") : t("apply_plan_desc")}
            </p>
          </div>
          <Icon
            path={open ? mdiChevronUp : mdiChevronDown}
            size={0.8}
            className="text-violet-400 flex-shrink-0"
          />
        </button>

        {open && (
          <div className="px-4 pb-4 space-y-3 border-t border-violet-200 dark:border-violet-700/60 pt-3">
            <ul className="space-y-2">
              {preview.items.map((it) => (
                <li key={it.allocationId} className="flex items-center gap-2">
                  <IconDisplay icon={it.icon} color={it.color} size="sm" />
                  <span className="flex-1 text-xs font-semibold text-base-theme truncate">
                    {it.name}
                  </span>
                  <div className="relative w-28 flex-shrink-0">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-muted-theme">
                      ฿
                    </span>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min={0}
                      placeholder="0"
                      value={inputs[it.allocationId] ?? ""}
                      onChange={(e) => {
                        setInputs((prev) => ({
                          ...prev,
                          [it.allocationId]: e.target.value,
                        }));
                        setErr("");
                      }}
                      className="w-full pl-5 pr-2 py-1.5 rounded-lg border border-theme bg-white dark:bg-slate-700
                                 text-xs font-semibold text-base-theme outline-none
                                 focus:border-violet-400 transition-all"
                    />
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-center justify-between text-xs font-semibold pt-1">
              <span className="text-muted-theme">
                {t("apply_plan_total")}{" "}
                <span
                  className={clsx(
                    overCapacity ? "text-rose-500" : "text-violet-600 dark:text-violet-400",
                  )}
                >
                  ฿{fmt(total)}
                </span>
              </span>
              <span className="text-muted-theme">
                {t("apply_plan_available")} ฿{fmt(unallocated)}
              </span>
            </div>

            {overCapacity && (
              <p className="text-xs text-rose-500 font-medium">
                ⚠️ {t("apply_plan_over")}
              </p>
            )}
            {err && <p className="text-xs text-rose-500 font-medium">{err}</p>}

            <div className="flex gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  setInputs({});
                  setErr("");
                }}
                className="flex items-center justify-center w-10 h-10 rounded-xl
                           bg-slate-100 dark:bg-slate-700 text-muted-theme flex-shrink-0"
              >
                <Icon path={mdiClose} size={0.7} />
              </button>
              <button
                onClick={handleApply}
                disabled={busy || done || overCapacity || total <= 0}
                className={clsx(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl",
                  "text-sm font-bold text-white transition-all",
                  done
                    ? "bg-emerald-500"
                    : busy || overCapacity || total <= 0
                      ? "bg-violet-300 dark:bg-violet-800 cursor-not-allowed"
                      : "bg-violet-600 active:bg-violet-700",
                )}
              >
                {done ? (
                  <>
                    <Icon path={mdiCheck} size={0.7} /> {t("move_success")}
                  </>
                ) : busy ? (
                  t("saving")
                ) : isFirstTime ? (
                  t("set_month_plan")
                ) : (
                  t("apply_last_month_plan")
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
