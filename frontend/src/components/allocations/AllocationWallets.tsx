import { useState } from "react";
import Icon from "@mdi/react";
import {
  mdiWalletOutline,
  mdiArrowRight,
  mdiCheck,
  mdiClose,
  mdiCurrencyUsd,
  mdiProgressCheck,
  mdiPencilOutline,
  mdiSwapHorizontal,
  mdiArrowLeft,
  mdiAlertCircleOutline,
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
import MonthlyFundingTemplate from "./MonthlyFundingTemplate";
import { useT } from "../../store/i18n.store";
import type {
  Allocation,
  AllocationSummary,
  BalanceSummary,
} from "../../types";

// ── Types ─────────────────────────────────────────────────────
interface Enriched extends Allocation {
  spentThisMonth: number;
  fundedThisMonth: number;
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
    return {
      ...a,
      spentThisMonth: spent,
      fundedThisMonth: s?.fundedThisMonth ?? 0,
    };
  });
}

function fmt(n: number) {
  return n.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ── Balance Overview Card ─────────────────────────────────────
/**
 * A reconciliation rather than a percentage.
 *
 * This used to net positive and negative envelopes into one "allocated" figure and report
 * "100% allocated · ฿0 waiting" on a screen that also listed two envelopes in deficit —
 * technically true, and impossible to make sense of. Showing the deficit as its own line
 * is what makes the arithmetic legible.
 */
function BalanceOverview({ balance }: { balance: BalanceSummary }) {
  const t = useT();
  const total = balance.totalBalance;
  const inEnvelopes = balance.positiveWalletBalance ?? balance.allocatedBalance;
  const deficit = balance.walletDeficit ?? 0;
  const unalloc = balance.unallocatedBalance;

  return (
    <div className="px-5 pt-5 pb-4 border-b border-theme">
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-xs font-semibold text-muted-theme uppercase tracking-wide">
          {t("total_balance")}
        </p>
        <p className="text-2xl font-extrabold text-base-theme tabular-nums">฿{fmt(total)}</p>
      </div>

      <dl className="space-y-1.5 text-xs">
        <div className="flex justify-between">
          <dt className="flex items-center gap-1.5 text-muted-theme">
            <span className="w-2 h-2 rounded-full bg-brand-500 inline-block" />
            {t("wal_in_envelopes")}
          </dt>
          <dd className="font-semibold text-base-theme tabular-nums">฿{fmt(inEnvelopes)}</dd>
        </div>

        {deficit > 0 && (
          <div className="flex justify-between">
            <dt className="flex items-center gap-1.5 text-rose-500">
              <span className="w-2 h-2 rounded-full bg-rose-400 inline-block" />
              {t("wal_overspent")}
            </dt>
            <dd className="font-semibold text-rose-500 tabular-nums">−฿{fmt(deficit)}</dd>
          </div>
        )}

        <div className="flex justify-between">
          <dt
            className={clsx(
              "flex items-center gap-1.5",
              unalloc < 0 ? "text-rose-500" : unalloc > 0 ? "text-amber-500" : "text-muted-theme",
            )}
          >
            <span
              className={clsx(
                "w-2 h-2 rounded-full inline-block",
                unalloc < 0 ? "bg-rose-400" : unalloc > 0 ? "bg-amber-400" : "bg-slate-300 dark:bg-slate-600",
              )}
            />
            {t("wal_unsplit")}
          </dt>
          <dd
            className={clsx(
              "font-semibold tabular-nums",
              unalloc < 0 ? "text-rose-500" : unalloc > 0 ? "text-amber-500" : "text-muted-theme",
            )}
          >
            ฿{fmt(unalloc)}
          </dd>
        </div>
      </dl>

      {deficit > 0 && (
        <p className="text-[11px] text-muted-theme leading-relaxed mt-3">
          {balance.negativeWalletCount} {t("wal_overspent_count")} — {t("wal_overspent_body")}
        </p>
      )}
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
                  step="0.01"
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
                onClick={() => setInputAmt(amount.toFixed(2))}
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

// ── Over-allocated Warning Banner ─────────────────────────────
// Shown when wallets collectively hold MORE than the real total balance,
// i.e. unallocatedBalance < 0. User must return funds from a wallet to fix.
function OverAllocatedWarning({ amount }: { amount: number }) {
  const t = useT();
  return (
    <div className="mx-5 mb-4 animate-fade-up">
      <div
        className="rounded-2xl bg-rose-50 dark:bg-rose-900/20
                   border border-rose-200 dark:border-rose-700
                   px-4 py-3 flex items-start gap-3"
      >
        <div
          className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-800/50
                     flex items-center justify-center flex-shrink-0"
        >
          <Icon path={mdiAlertCircleOutline} size={0.75} color="#f43f5e" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-rose-700 dark:text-rose-300">
            {t("over_allocated")} ฿{fmt(amount)}
          </p>
          <p className="text-xs text-rose-500 dark:text-rose-400 mt-0.5">
            {t("over_allocated_desc")}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Wallet Row ────────────────────────────────────────────────
function WalletRow({
  wallet,
  unallocated,
  otherWallets,
  onMoved,
}: {
  wallet: Enriched;
  unallocated: number;
  otherWallets: Enriched[];
  onMoved: () => void;
}) {
  const t = useT();

  // "Add from unallocated" panel
  const [showFund, setShowFund] = useState(false);
  const [fundAmt, setFundAmt]   = useState("");
  const [fundBusy, setFundBusy] = useState(false);
  const [fundDone, setFundDone] = useState(false);
  const [fundErr, setFundErr]   = useState("");

  // Deficit recovery: pull from another envelope to bring this one back to zero.
  const [showFix, setShowFix]     = useState(false);
  const [fixSource, setFixSource] = useState("");
  const [fixAmt, setFixAmt]       = useState("");
  const [fixBusy, setFixBusy]     = useState(false);
  const [fixErr, setFixErr]       = useState("");

  // "Adjust" panel (transfer / unallocate)
  const [showAdj, setShowAdj]     = useState(false);
  const [adjMode, setAdjMode]     = useState<"transfer" | "unallocate" | null>(null);
  const [adjAmt, setAdjAmt]       = useState("");
  const [adjTarget, setAdjTarget] = useState("");
  const [adjBusy, setAdjBusy]     = useState(false);
  const [adjDone, setAdjDone]     = useState(false);
  const [adjErr, setAdjErr]       = useState("");

  const resetAdj = () => {
    setAdjMode(null);
    setAdjAmt("");
    setAdjTarget("");
    setAdjBusy(false);
    setAdjDone(false);
    setAdjErr("");
  };

  const handleFund = async () => {
    const n = Number(fundAmt);
    if (!n || n <= 0) return;
    if (n > unallocated) { setFundErr("⚠️ " + t("insufficient_funds")); return; }
    setFundBusy(true); setFundErr("");
    try {
      await allocationsApi.moveToAllocation(wallet.id, n);
      setFundDone(true);
      setTimeout(() => { setFundDone(false); setShowFund(false); setFundAmt(""); onMoved(); }, 800);
    } catch (e: any) {
      setFundErr(e?.response?.data?.message ?? "Error");
    } finally { setFundBusy(false); }
  };

  const handleAdjust = async () => {
    const n = Number(adjAmt);
    if (!n || n <= 0) return;
    if (n > Number(wallet.balance)) { setAdjErr("⚠️ " + t("insufficient_funds")); return; }
    if (adjMode === "transfer" && !adjTarget) return;
    setAdjBusy(true); setAdjErr("");
    try {
      if (adjMode === "transfer") {
        await allocationsApi.transfer(wallet.id, adjTarget, n);
      } else {
        await allocationsApi.unallocate(wallet.id, n);
      }
      setAdjDone(true);
      setTimeout(() => { setAdjDone(false); setShowAdj(false); resetAdj(); onMoved(); }, 800);
    } catch (e: any) {
      setAdjErr(e?.response?.data?.message ?? "Error");
    } finally { setAdjBusy(false); }
  };

  const walletBalance = Number(wallet.balance);

  return (
    <li>
      {/* Main row */}
      <div className="flex items-center gap-3 px-5 py-3">
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: (wallet.color ?? "#6366f1") + "22" }}
        >
          <IconDisplay icon={wallet.icon ?? "💼"} color={wallet.color} size="md" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-1 mb-0.5">
            <p className="text-sm font-semibold text-base-theme truncate">{wallet.name}</p>
            <p className={clsx(
              "text-sm font-bold flex-shrink-0 tabular-nums",
              walletBalance < 0 ? "text-rose-500" : "text-base-theme",
            )}>
              ฿{fmt(walletBalance)}
            </p>
          </div>

          {/* A negative balance gets words, not a bare minus sign.
              The progress bar that used to sit here divided this month's spend by
              `balance + spend`, so any envelope at or below zero rendered as a full red
              bar no matter what had actually happened — two envelopes both at ฿0.00 could
              look completely different. There is no honest denominator for a lifetime
              balance, so the bar is gone; the funding template has a real one. */}
          {walletBalance < 0 && (
            <p className="text-[10px] font-semibold text-rose-500 mb-0.5">
              {t("wal_overspent")} · {t("wal_overspent_by")} ฿{fmt(-walletBalance)}
            </p>
          )}

          <div className="flex items-center justify-between mt-0.5">
            <span className="text-[10px] text-muted-theme truncate">
              {getCombinedCategories(wallet).slice(0, 3).map((c) => c.name).join(", ")}
              {getCombinedCategories(wallet).length > 3 && ` +${getCombinedCategories(wallet).length - 3}`}
            </span>
            {(wallet.fundedThisMonth > 0 || wallet.spentThisMonth > 0) && (
              <span className="text-[10px] font-medium flex items-center gap-1 flex-shrink-0 ml-1">
                {wallet.fundedThisMonth > 0 && (
                  <span className="text-emerald-500">+฿{fmt(wallet.fundedThisMonth)}</span>
                )}
                {wallet.fundedThisMonth > 0 && wallet.spentThisMonth > 0 && (
                  <span className="text-muted-theme">·</span>
                )}
                {wallet.spentThisMonth > 0 && (
                  <span className="text-rose-400">−฿{fmt(wallet.spentThisMonth)}</span>
                )}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 flex-shrink-0">
          {/* An overspent envelope must offer a way out from the row that reports it.
              Both controls used to be gated — the pencil on `balance > 0`, the fund arrow
              on `unallocated > 0` — so an envelope in deficit with an empty pool showed a
              problem and no action at all. Money can still come from another envelope. */}
          {walletBalance < 0 && otherWallets.some((w) => Number(w.balance) > 0) && (
            <button
              onClick={() => { setShowAdj(false); setShowFund(false); setShowFix((v) => !v); }}
              className={clsx(
                "px-2.5 h-8 rounded-xl flex items-center justify-center gap-1 transition-all text-[11px] font-bold",
                showFix
                  ? "bg-rose-100 dark:bg-rose-900/40 text-rose-600"
                  : "bg-rose-50 dark:bg-rose-900/20 text-rose-600",
              )}
            >
              {t("wal_fix")}
            </button>
          )}

          {/* Adjust button (pencil) — shown when wallet has balance */}
          {walletBalance > 0 && (
            <button
              onClick={() => { setShowAdj((v) => !v); setShowFund(false); resetAdj(); }}
              className={clsx(
                "w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                showAdj
                  ? "bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600"
                  : "bg-slate-100 dark:bg-slate-700 text-muted-theme hover:text-indigo-500",
              )}
              title={t("adjust_wallet")}
            >
              <Icon path={mdiPencilOutline} size={0.6} />
            </button>
          )}
          {/* Fund button (arrow) — shown when unallocated > 0 */}
          {unallocated > 0 && (
            <button
              onClick={() => { setShowFund((v) => !v); setShowAdj(false); setFundAmt(""); setFundErr(""); }}
              className={clsx(
                "w-8 h-8 rounded-xl flex items-center justify-center transition-all",
                showFund
                  ? "bg-brand-100 dark:bg-brand-900/40 text-brand-600"
                  : "bg-slate-100 dark:bg-slate-700 text-muted-theme hover:text-brand-500",
              )}
              title={t("move_to_wallet")}
            >
              <Icon path={mdiArrowRight} size={0.65} />
            </button>
          )}
        </div>
      </div>

      {/* Deficit recovery: move money in from an envelope that has some.
          Uses the ordinary transfer endpoint, so the movement stays in the audit log
          rather than overwriting a balance. */}
      {showFix && (
        <div className="mx-5 mb-3 p-3 rounded-2xl bg-rose-50 dark:bg-rose-900/20
                        border border-rose-100 dark:border-rose-800 animate-fade-up">
          <p className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wide mb-2">
            {t("wal_fix")} → {wallet.name} (฿{fmt(-walletBalance)})
          </p>

          {(() => {
            const donors = otherWallets.filter((w) => Number(w.balance) > 0)
            if (donors.length === 0) {
              return <p className="text-xs text-muted-theme">{t("wal_no_source")}</p>
            }
            const source = donors.find((d) => d.id === fixSource) ?? donors[0]
            const max = Math.min(-walletBalance, Number(source.balance))
            const amount = fixAmt === "" ? max : Number(fixAmt) || 0
            const valid = amount > 0 && amount <= Number(source.balance)

            return (
              <div className="space-y-2">
                <div>
                  <p className="text-[10px] text-muted-theme mb-1">{t("wal_fix_from")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {donors.map((d) => (
                      <button key={d.id} onClick={() => { setFixSource(d.id); setFixAmt(""); setFixErr("") }}
                        className={clsx(
                          "px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-colors",
                          source.id === d.id
                            ? "bg-rose-600 text-white"
                            : "bg-card border border-theme text-base-theme",
                        )}>
                        {d.name} ฿{fmt(Number(d.balance))}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <input type="number" inputMode="decimal" step="0.01" min={0.01} max={Number(source.balance)}
                    placeholder={String(max)} value={fixAmt}
                    onChange={(e) => { setFixAmt(e.target.value); setFixErr("") }}
                    className="flex-1 px-3 py-2 rounded-xl border border-theme bg-card text-sm
                               text-base-theme outline-none focus:border-rose-400" />
                  <button
                    onClick={async () => {
                      if (!valid) { setFixErr(t("insufficient_funds")); return }
                      setFixBusy(true); setFixErr("")
                      try {
                        await allocationsApi.transfer(source.id, wallet.id, amount)
                        setShowFix(false); setFixAmt(""); setFixSource("")
                        onMoved()
                      } catch (e: any) {
                        setFixErr(e?.response?.data?.message ?? t("err_generic"))
                      } finally { setFixBusy(false) }
                    }}
                    disabled={fixBusy || !valid}
                    className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold
                               disabled:opacity-50 active:scale-95 transition-transform"
                  >
                    {fixBusy ? t("saving") : t("wal_fix")}
                  </button>
                </div>

                {/* Say what the balances become before the money moves. */}
                <p className="text-[10px] text-muted-theme tabular-nums">
                  {wallet.name} {t("wal_after")} ฿{fmt(walletBalance + amount)} ·
                  {" "}{source.name} {t("wal_after")} ฿{fmt(Number(source.balance) - amount)}
                </p>
                {fixErr && <p className="text-[11px] text-rose-500 font-medium">{fixErr}</p>}
              </div>
            )
          })()}
        </div>
      )}

      {/* Fund panel: add from unallocated */}
      {showFund && (
        <div className="mx-5 mb-3 p-3 rounded-2xl bg-brand-50 dark:bg-brand-900/20
                        border border-brand-100 dark:border-brand-800 animate-fade-up">
          <p className="text-[10px] font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wide mb-2">
            {t("move_to_wallet")} → {wallet.name}
            <span className="ml-2 font-normal text-muted-theme normal-case">
              (รอจัดสรร ฿{fmt(unallocated)})
            </span>
          </p>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-theme">฿</span>
              <input type="number" inputMode="decimal" step="0.01" min={1} max={unallocated} placeholder="0"
                value={fundAmt} onChange={(e) => { setFundAmt(e.target.value); setFundErr(""); }}
                className="w-full pl-6 pr-2 py-2 rounded-xl border border-theme bg-white dark:bg-slate-700
                           text-sm font-semibold text-base-theme outline-none focus:border-brand-400 transition-all" />
            </div>
            <button type="button" onClick={() => setFundAmt(unallocated.toFixed(2))}
              className="px-2.5 py-1 rounded-xl bg-brand-100 dark:bg-brand-900/40 text-xs font-bold text-brand-600 dark:text-brand-300 border border-brand-200 dark:border-brand-700">
              Max
            </button>
            <button onClick={handleFund} disabled={fundBusy || fundDone || !fundAmt || Number(fundAmt) <= 0}
              className={clsx(
                "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all",
                fundDone ? "bg-emerald-500"
                : fundBusy ? "bg-brand-300 cursor-not-allowed"
                : !fundAmt ? "bg-slate-200 dark:bg-slate-600 cursor-not-allowed"
                : "bg-brand-600 active:bg-brand-700",
              )}>
              <Icon path={fundDone ? mdiCheck : mdiArrowRight} size={0.65} color="white" />
            </button>
          </div>
          {fundErr && <p className="text-[10px] text-rose-500 mt-1.5 font-medium">{fundErr}</p>}
        </div>
      )}

      {/* Adjust panel: transfer / unallocate */}
      {showAdj && (
        <div className="mx-5 mb-3 p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-900/20
                        border border-indigo-100 dark:border-indigo-800 animate-fade-up">

          {/* Mode selection */}
          {adjMode === null && (
            <div className="space-y-2">
              <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-2">
                {wallet.name} · ฿{fmt(walletBalance)}
              </p>
              {otherWallets.length > 0 && (
                <button onClick={() => setAdjMode("transfer")}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                             bg-white dark:bg-slate-700 border border-indigo-100 dark:border-indigo-700 text-left
                             hover:border-indigo-400 transition-all">
                  <Icon path={mdiSwapHorizontal} size={0.75} color="#6366f1" />
                  <div>
                    <p className="text-xs font-bold text-base-theme">{t("transfer_to_wallet")}</p>
                    <p className="text-[10px] text-muted-theme">{t("transfer_to_wallet_desc")}</p>
                  </div>
                </button>
              )}
              <button onClick={() => setAdjMode("unallocate")}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl
                           bg-white dark:bg-slate-700 border border-indigo-100 dark:border-indigo-700 text-left
                           hover:border-amber-400 transition-all">
                <Icon path={mdiArrowLeft} size={0.75} color="#f59e0b" />
                <div>
                  <p className="text-xs font-bold text-base-theme">{t("return_to_unalloc")}</p>
                  <p className="text-[10px] text-muted-theme">{t("return_to_unalloc_desc")}</p>
                </div>
              </button>
            </div>
          )}

          {/* Transfer form */}
          {adjMode === "transfer" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => { setAdjMode(null); setAdjAmt(""); setAdjTarget(""); setAdjErr(""); }}
                  className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                  <Icon path={mdiClose} size={0.5} />
                </button>
                <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide">
                  {t("transfer_to_wallet")}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {otherWallets.map((w) => (
                  <button key={w.id} onClick={() => setAdjTarget(w.id)}
                    className={clsx(
                      "flex items-center gap-2 px-2.5 py-2 rounded-xl border-2 transition-all text-left",
                      adjTarget === w.id
                        ? "border-indigo-500 bg-indigo-100 dark:bg-indigo-800/40"
                        : "border-transparent bg-white dark:bg-slate-700/50",
                    )}>
                    <IconDisplay icon={w.icon ?? "💼"} color={w.color} size="sm" />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-base-theme truncate">{w.name}</p>
                      <p className="text-[10px] text-muted-theme">฿{fmt(Number(w.balance))}</p>
                    </div>
                  </button>
                ))}
              </div>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-theme">฿</span>
                  <input type="number" inputMode="decimal" step="0.01" min={1} max={walletBalance} placeholder="0"
                    value={adjAmt} onChange={(e) => { setAdjAmt(e.target.value); setAdjErr(""); }}
                    className="w-full pl-6 pr-2 py-2 rounded-xl border border-theme bg-white dark:bg-slate-700
                               text-sm font-semibold text-base-theme outline-none focus:border-indigo-400 transition-all" />
                </div>
                <button type="button" onClick={() => setAdjAmt(walletBalance.toFixed(2))}
                  className="px-2.5 py-1 rounded-xl bg-brand-100 dark:bg-brand-900/40 text-xs font-bold text-brand-600 dark:text-brand-300 border border-brand-200 dark:border-brand-700">
                  Max
                </button>
                <button onClick={handleAdjust}
                  disabled={adjBusy || adjDone || !adjAmt || !adjTarget || Number(adjAmt) <= 0}
                  className={clsx(
                    "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all",
                    adjDone ? "bg-emerald-500"
                    : adjBusy ? "bg-indigo-300 cursor-not-allowed"
                    : (!adjAmt || !adjTarget) ? "bg-slate-200 dark:bg-slate-600 cursor-not-allowed"
                    : "bg-indigo-600 active:bg-indigo-700",
                  )}>
                  <Icon path={adjDone ? mdiCheck : mdiSwapHorizontal} size={0.65} color="white" />
                </button>
              </div>
              {adjErr && <p className="text-[10px] text-rose-500 mt-1.5 font-medium">{adjErr}</p>}
            </div>
          )}

          {/* Unallocate form */}
          {adjMode === "unallocate" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 mb-2">
                <button onClick={() => { setAdjMode(null); setAdjAmt(""); setAdjErr(""); }}
                  className="w-6 h-6 rounded-lg bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                  <Icon path={mdiClose} size={0.5} />
                </button>
                <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wide">
                  {t("return_to_unalloc")}
                </p>
              </div>
              <p className="text-[10px] text-muted-theme">
                {wallet.name}: ฿{fmt(walletBalance)}
              </p>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-theme">฿</span>
                  <input type="number" inputMode="decimal" step="0.01" min={1} max={walletBalance} placeholder="0"
                    value={adjAmt} onChange={(e) => { setAdjAmt(e.target.value); setAdjErr(""); }}
                    className="w-full pl-6 pr-2 py-2 rounded-xl border border-theme bg-white dark:bg-slate-700
                               text-sm font-semibold text-base-theme outline-none focus:border-amber-400 transition-all" />
                </div>
                <button type="button" onClick={() => setAdjAmt(walletBalance.toFixed(2))}
                  className="px-2.5 py-1 rounded-xl bg-brand-100 dark:bg-brand-900/40 text-xs font-bold text-brand-600 dark:text-brand-300 border border-brand-200 dark:border-brand-700">
                  Max
                </button>
                <button onClick={handleAdjust}
                  disabled={adjBusy || adjDone || !adjAmt || Number(adjAmt) <= 0}
                  className={clsx(
                    "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-all",
                    adjDone ? "bg-emerald-500"
                    : adjBusy ? "bg-amber-300 cursor-not-allowed"
                    : !adjAmt ? "bg-slate-200 dark:bg-slate-600 cursor-not-allowed"
                    : "bg-amber-500 active:bg-amber-600",
                  )}>
                  <Icon path={adjDone ? mdiCheck : mdiArrowLeft} size={0.65} color="white" />
                </button>
              </div>
              {adjErr && <p className="text-[10px] text-rose-500 mt-1.5 font-medium">{adjErr}</p>}
            </div>
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
  // < -0.005 → genuinely over-allocated (ignore float rounding noise near 0)
  const overAllocated = unallocated < -0.005;
  const fullyAllocated = !overAllocated && unallocated <= 0;

  return (
    <Card padding={false} className="overflow-hidden">
      {/* Balance overview */}
      {balance && <BalanceOverview balance={balance} />}

      {/* Unallocated funds banner (positive) OR over-allocated warning (negative) */}
      <div className="pt-4">
        <MonthlyFundingTemplate unallocated={unallocated} onApplied={refetchAll} />
        <UnallocatedBanner
          amount={unallocated}
          allocations={enriched}
          onMoved={refetchAll}
        />
        {overAllocated && <OverAllocatedWarning amount={-unallocated} />}
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
              otherWallets={enriched.filter((w) => w.id !== wallet.id)}
              onMoved={refetchAll}
            />
          ))}
        </ul>
      </div>

      {/* Footer: all-allocated state (only when truly balanced, not over-allocated) */}
      {fullyAllocated && balance && balance.totalBalance > 0 && (
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
