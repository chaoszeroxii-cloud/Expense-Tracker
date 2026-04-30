import { useState } from "react";
import Icon from "@mdi/react";
import {
  mdiWalletOutline,
  mdiArrowRight,
  mdiCheck,
  mdiClose,
  mdiCurrencyUsd,
  mdiProgressCheck,
} from "@mdi/js";
import clsx from "clsx";
import {
  useAllocations,
  useAllocationSummary,
  useBalanceSummary,
} from "../../hooks";
import { allocationsApi } from "../../api";
import { Card, Skeleton } from "../ui";
import IconDisplay from "../ui/IconDisplay";
import { useT } from "../../store/i18n.store";
import type {
  Allocation,
  AllocationSummary,
  BalanceSummary,
} from "../../types";

// ── Types ─────────────────────────────────────────────────────
interface Enriched extends Allocation {
  spentThisMonth: number;
  receivedThisMonth: number;
  usagePercent: number;
}

/**
 * Get combined categories (both expense and income) from an allocation.
 */
function getCombinedCategories(alloc: Allocation) {
  return [
    ...(alloc.categories ?? []),
    ...(alloc.incomeCategories ?? []),
  ];
}

function enrich(
  allocations: Allocation[],
  summaries: AllocationSummary[],
): Enriched[] {
  return allocations.map((a) => {
    const s = summaries.find((x) => x.allocationId === a.id);
    const spent = s?.spentThisMonth ?? 0;
    const inflow = Number(a.balance) + spent;
    return {
      ...a,
      spentThisMonth: spent,
      receivedThisMonth: s?.receivedThisMonth ?? 0,
      usagePercent:
        inflow > 0 ? Math.min(100, Math.round((spent / inflow) * 100)) : 0,
    };
  });
}

function fmt(n: number) {
  return n.toLocaleString("th-TH", { maximumFractionDigits: 0 });
}

// ── Balance Overview Card ─────────────────────────────────────
function BalanceOverview({ balance }: { balance: BalanceSummary }) {
  const t = useT();
  const total = balance.totalBalance;
  const allocated = balance.allocatedBalance;
  const unalloc = balance.unallocatedBalance;
  const allocPct =
    total > 0 ? Math.min(100, Math.round((allocated / total) * 100)) : 0;

  return (
    <div className="px-5 pt-5 pb-4 border-b border-theme">
      {/* Total */}
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xs font-semibold text-muted-theme uppercase tracking-wide">
          {t("total_balance")}
        </p>
        <p className="text-2xl font-extrabold text-base-theme">฿{fmt(total)}</p>
      </div>

      {/* Progress bar */}
      <div className="h-2.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden mb-2.5">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${allocPct}%`,
            background: "linear-gradient(90deg, #6366f1, #818cf8)",
          }}
        />
      </div>

      {/* Labels */}
      <div className="flex justify-between text-xs font-semibold">
        <span className="flex items-center gap-1.5 text-brand-600 dark:text-brand-400">
          <span className="w-2 h-2 rounded-full bg-brand-500 inline-block" />
          {t("allocated")} ฿{fmt(allocated)}
          <span className="text-muted-theme font-normal">({allocPct}%)</span>
        </span>
        <span
          className={clsx(
            "flex items-center gap-1.5",
            unalloc > 0 ? "text-amber-500" : "text-muted-theme",
          )}
        >
          <span
            className={clsx(
              "w-2 h-2 rounded-full inline-block",
              unalloc > 0 ? "bg-amber-400" : "bg-slate-300 dark:bg-slate-600",
            )}
          />
          {t("unallocated")} ฿{fmt(unalloc)}
        </span>
      </div>
    </div>
  );
}

// ── Unallocated Funds Banner ──────────────────────────────────
function UnallocatedBanner({
  amount,
  allocations,
  onMoved,
}: {
  amount: number;
  allocations: Enriched[];
  onMoved: () => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [targetId, setTargetId] = useState("");
  const [inputAmt, setInputAmt] = useState("");
  const [moving, setMoving] = useState(false);
  const [errMsg, setErrMsg] = useState("");
  const [doneFlash, setDoneFlash] = useState(false);

  if (amount <= 0) return null;

  const handleMove = async () => {
    const n = Number(inputAmt);
    if (!n || n <= 0 || !targetId) return;
    if (n > amount) {
      setErrMsg("⚠️ " + t("insufficient_funds"));
      return;
    }
    setMoving(true);
    setErrMsg("");
    try {
      await allocationsApi.moveToAllocation(targetId, n);
      setDoneFlash(true);
      setTimeout(() => {
        setDoneFlash(false);
        setOpen(false);
        setInputAmt("");
        setTargetId("");
        onMoved();
      }, 900);
    } catch (e: any) {
      setErrMsg(e?.response?.data?.message ?? "Error");
    } finally {
      setMoving(false);
    }
  };

  return (
    <div className="mx-5 mb-4 animate-fade-up">
      <div
        className="rounded-2xl bg-amber-50 dark:bg-amber-900/20
                      border border-amber-200 dark:border-amber-700 overflow-hidden"
      >
        {/* Header row */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center gap-3 px-4 py-3 text-left"
        >
          <div
            className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-800/50
                          flex items-center justify-center flex-shrink-0"
          >
            <Icon path={mdiCurrencyUsd} size={0.75} color="#f59e0b" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-amber-700 dark:text-amber-300">
              {t("unallocated_funds")}
            </p>
            <p className="text-xs text-amber-500 dark:text-amber-400">
              {t("unallocated_desc")}
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-base font-extrabold text-amber-600 dark:text-amber-400">
              ฿{fmt(amount)}
            </p>
          </div>
        </button>

        {/* Distribute form */}
        {open && (
          <div className="px-4 pb-4 space-y-3 border-t border-amber-200 dark:border-amber-700/60 pt-3">
            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-300 uppercase tracking-wide">
              {t("move_to_wallet")}
            </p>

            {/* Wallet picker */}
            <div className="grid grid-cols-2 gap-2">
              {allocations.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setTargetId(a.id)}
                  className={clsx(
                    "flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 transition-all text-left",
                    targetId === a.id
                      ? "border-amber-500 bg-amber-100 dark:bg-amber-800/40 shadow-sm"
                      : "border-transparent bg-white dark:bg-slate-700/50",
                  )}
                >
                  <IconDisplay
                    icon={a.icon ?? "💼"}
                    color={a.color}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-base-theme truncate">
                      {a.name}
                    </p>
                    <p className="text-[10px] text-muted-theme">
                      ฿{fmt(Number(a.balance))}
                    </p>
                  </div>
                </button>
              ))}
            </div>

            {/* Amount input */}
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-bold text-muted-theme">
                  ฿
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={amount}
                  placeholder={t("move_amount_ph")}
                  value={inputAmt}
                  onChange={(e) => {
                    setInputAmt(e.target.value);
                    setErrMsg("");
                  }}
                  className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-theme bg-white dark:bg-slate-700
                             text-sm font-semibold text-base-theme outline-none
                             focus:border-amber-400 transition-all"
                />
              </div>
              {/* Quick fill buttons */}
              <button
                type="button"
                onClick={() => setInputAmt(String(amount))}
                className="px-3 py-2 rounded-xl bg-amber-100 dark:bg-amber-800/40
                           text-xs font-bold text-amber-600 dark:text-amber-300 whitespace-nowrap"
              >
                Max
              </button>
            </div>

            {errMsg && (
              <p className="text-xs text-rose-500 font-medium">{errMsg}</p>
            )}

            {/* Action buttons */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setOpen(false);
                  setInputAmt("");
                  setTargetId("");
                  setErrMsg("");
                }}
                className="flex items-center justify-center w-10 h-10 rounded-xl
                           bg-slate-100 dark:bg-slate-700 text-muted-theme flex-shrink-0"
              >
                <Icon path={mdiClose} size={0.7} />
              </button>
              <button
                onClick={handleMove}
                disabled={
                  moving ||
                  doneFlash ||
                  !targetId ||
                  !inputAmt ||
                  Number(inputAmt) <= 0
                }
                className={clsx(
                  "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl",
                  "text-sm font-bold text-white transition-all",
                  doneFlash
                    ? "bg-emerald-500"
                    : moving || !targetId || !inputAmt
                      ? "bg-amber-300 dark:bg-amber-700 cursor-not-allowed"
                      : "bg-amber-500 active:bg-amber-600",
                )}
              >
                {doneFlash ? (
                  <>
                    <Icon path={mdiCheck} size={0.7} /> {t("move_success")}
                  </>
                ) : moving ? (
                  t("saving")
                ) : (
                  <>
                    <Icon path={mdiArrowRight} size={0.7} /> {t("distribute")}
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Wallet Row ────────────────────────────────────────────────
function WalletRow({
  wallet,
  unallocated,
  onMoved,
}: {
  wallet: Enriched;
  unallocated: number;
  onMoved: () => void;
}) {
  const t = useT();
  const [showMove, setShowMove] = useState(false);
  const [inputAmt, setInputAmt] = useState("");
  const [moving, setMoving] = useState(false);
  const [done, setDone] = useState(false);
  const [errMsg, setErrMsg] = useState("");

  const handleMove = async () => {
    const n = Number(inputAmt);
    if (!n || n <= 0) return;
    if (n > unallocated) {
      setErrMsg("⚠️ " + t("insufficient_funds"));
      return;
    }
    setMoving(true);
    setErrMsg("");
    try {
      await allocationsApi.moveToAllocation(wallet.id, n);
      setDone(true);
      setTimeout(() => {
        setDone(false);
        setShowMove(false);
        setInputAmt("");
        onMoved();
      }, 800);
    } catch (e: any) {
      setErrMsg(e?.response?.data?.message ?? "Error");
    } finally {
      setMoving(false);
    }
  };

  const barColor =
    wallet.usagePercent > 80
      ? "#f43f5e"
      : wallet.usagePercent > 50
        ? "#f97316"
        : (wallet.color ?? "#6366f1");

  return (
    <li>
      <div className="flex items-center gap-3 px-5 py-3">
        {/* Icon */}
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: (wallet.color ?? "#6366f1") + "22" }}
        >
          <IconDisplay
            icon={wallet.icon ?? "💼"}
            color={wallet.color}
            size="md"
          />
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-1 mb-1">
            <p className="text-sm font-semibold text-base-theme truncate">
              {wallet.name}
            </p>
            <p className="text-sm font-bold text-base-theme flex-shrink-0">
              ฿{fmt(Number(wallet.balance))}
            </p>
          </div>
          {/* Mini progress bar */}
          <div className="h-1 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${wallet.usagePercent}%`,
                backgroundColor: barColor,
              }}
            />
          </div>
          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[10px] text-muted-theme">
              {getCombinedCategories(wallet)
                .slice(0, 3)
                .map((c) => c.name)
                .join(", ")}
              {getCombinedCategories(wallet).length > 3 &&
                ` +${getCombinedCategories(wallet).length - 3}`}
            </span>
            {wallet.spentThisMonth > 0 && (
              <span className="text-[10px] text-rose-400 font-medium">
                −฿{fmt(wallet.spentThisMonth)} {t("this_month")}
              </span>
            )}
          </div>
        </div>

        {/* Add funds button (only if there are unallocated funds) */}
        {unallocated > 0 && (
          <button
            onClick={() => {
              setShowMove((v) => !v);
              setInputAmt("");
              setErrMsg("");
            }}
            className={clsx(
              "flex-shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all",
              showMove
                ? "bg-brand-100 dark:bg-brand-900/40 text-brand-600"
                : "bg-slate-100 dark:bg-slate-700 text-muted-theme hover:text-brand-500",
            )}
            title={t("move_to_wallet")}
          >
            <Icon path={mdiArrowRight} size={0.65} />
          </button>
        )}
      </div>

      {/* Inline move form */}
      {showMove && (
        <div
          className="mx-5 mb-3 p-3 rounded-2xl bg-brand-50 dark:bg-brand-900/20
                        border border-brand-100 dark:border-brand-800 animate-fade-up"
        >
          <p className="text-[10px] font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wide mb-2">
            {t("move_to_wallet")} → {wallet.name}
            <span className="ml-2 font-normal text-muted-theme normal-case">
              (รอจัดสรร ฿{fmt(unallocated)})
            </span>
          </p>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-theme">
                ฿
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={1}
                max={unallocated}
                placeholder="0"
                value={inputAmt}
                onChange={(e) => {
                  setInputAmt(e.target.value);
                  setErrMsg("");
                }}
                className="w-full pl-6 pr-2 py-2 rounded-xl border border-theme bg-white dark:bg-slate-700
                           text-sm font-semibold text-base-theme outline-none
                           focus:border-brand-400 transition-all"
              />
            </div>
            <button
              type="button"
              onClick={() => setInputAmt(String(unallocated))}
              className="px-2.5 rounded-xl bg-slate-100 dark:bg-slate-700 text-xs font-bold text-muted-theme"
            >
              Max
            </button>
            <button
              onClick={handleMove}
              disabled={moving || done || !inputAmt || Number(inputAmt) <= 0}
              className={clsx(
                "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all",
                done
                  ? "bg-emerald-500"
                  : moving
                    ? "bg-brand-300 cursor-not-allowed"
                    : !inputAmt
                      ? "bg-slate-200 dark:bg-slate-600 cursor-not-allowed"
                      : "bg-brand-600 active:bg-brand-700",
              )}
            >
              <Icon
                path={done ? mdiCheck : mdiArrowRight}
                size={0.65}
                color="white"
              />
            </button>
          </div>
          {errMsg && (
            <p className="text-[10px] text-rose-500 mt-1.5 font-medium">
              {errMsg}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

// ── Main Component ────────────────────────────────────────────
export default function AllocationWallets() {
  const t = useT();

  const {
    data: allocations,
    loading: la,
    refetch: refetchAllocs,
  } = useAllocations();
  const { data: summaries, loading: ls } = useAllocationSummary();
  const {
    data: balance,
    loading: lb,
    refetch: refetchBalance,
  } = useBalanceSummary();

  const refetchAll = () => {
    refetchAllocs();
    refetchBalance();
  };

  // ── Loading ──────────────────────────────────────────────────
  if (la || ls || lb)
    return (
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Icon
            path={mdiWalletOutline}
            size={0.7}
            className="text-muted-theme"
          />
          <p className="text-sm font-bold text-base-theme">{t("wallets")}</p>
        </div>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </Card>
    );

  // ── Empty ────────────────────────────────────────────────────
  if (!allocations?.length)
    return (
      <Card>
        <div className="flex items-center justify-between mb-1">
          <p className="text-sm font-bold text-base-theme flex items-center gap-2">
            <Icon path={mdiWalletOutline} size={0.7} /> {t("wallets")}
          </p>
          <span className="text-xs text-muted-theme">
            {t("settings_wallets")}
          </span>
        </div>
        <p className="text-xs text-muted-theme mt-2 text-center py-4">
          {t("no_wallets")}
        </p>
      </Card>
    );

  const enriched = enrich(allocations, summaries ?? []);
  const unallocated = balance?.unallocatedBalance ?? 0;

  return (
    <Card padding={false} className="overflow-hidden">
      {/* Balance overview */}
      {balance && <BalanceOverview balance={balance} />}

      {/* Unallocated funds banner (only when there's money to distribute) */}
      <div className="pt-4">
        <UnallocatedBanner
          amount={unallocated}
          allocations={enriched}
          onMoved={refetchAll}
        />
      </div>

      {/* Wallet list */}
      <div className="pb-1">
        <div className="flex items-center justify-between px-5 pb-3">
          <p className="text-xs font-semibold text-muted-theme uppercase tracking-wide">
            {t("wallets")}
          </p>
          <p className="text-xs text-muted-theme font-medium">{t("balance")}</p>
        </div>
        <ul className="divide-y divide-theme">
          {enriched.map((wallet) => (
            <WalletRow
              key={wallet.id}
              wallet={wallet}
              unallocated={unallocated}
              onMoved={refetchAll}
            />
          ))}
        </ul>
      </div>

      {/* Footer: all-allocated state */}
      {unallocated <= 0 && balance && balance.totalBalance > 0 && (
        <div className="flex items-center justify-center gap-1.5 py-3 border-t border-theme">
          <Icon path={mdiProgressCheck} size={0.6} color="#10b981" />
          <p className="text-xs text-emerald-500 font-semibold">
            {t("all_allocated")}
          </p>
        </div>
      )}
    </Card>
  );
}
