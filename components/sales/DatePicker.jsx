import { useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { isoFromDate, dateFromISO } from "@/lib/time";
import { displayDate } from "@/lib/format";

export function DatePicker({
  date, setDate, today, todayDateObj, usedDates, selectedDateObj, minDate = null,
}) {
  const isMobile  = useMediaQuery("(max-width: 767px)");
  const [open, setOpen] = useState(false);
  const blur = () => { if (document?.activeElement instanceof HTMLElement) document.activeElement.blur(); };
  const minDateObj = minDate ? dateFromISO(minDate) : null;

  const Trigger = (
    <button
      type="button"
      onClick={() => { blur(); setOpen(true); }}
      className="w-full h-[52px] rounded-2xl bg-zinc-800/50 border border-zinc-700/50 px-4 hover:bg-zinc-800/70 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/30"
    >
      <div className="flex items-center gap-3 min-w-0">
        <span className="grid place-items-center w-8 h-8 rounded-xl bg-zinc-900/40 border border-zinc-700/40 shrink-0">
          <CalendarIcon className="h-4 w-4 text-zinc-200" />
        </span>
        <div className="flex flex-col items-start leading-tight min-w-0">
          <span className="text-sm text-zinc-100 truncate w-full">{date}</span>
          <span className="text-xs text-zinc-400 truncate w-full">{displayDate(date)}</span>
        </div>
        <span className="ml-auto text-xs text-zinc-500 shrink-0">Pick</span>
      </div>
    </button>
  );

  const Cal = (
    <>
      <div className="px-3 py-2 border-b border-zinc-800 flex items-center justify-between gap-2">
        <span className="text-xs text-zinc-400">Choose a date</span>
        <button
          type="button"
          onClick={() => { setDate(today); setOpen(false); }}
          className="px-3 py-1.5 rounded-xl bg-white text-zinc-900 text-xs font-medium hover:bg-zinc-200 transition"
        >
          Today
        </button>
      </div>
      <div className="bg-zinc-950/95">
        <Calendar
          mode="single"
          selected={selectedDateObj}
          onSelect={(d) => {
            if (!d) return;
            const iso = isoFromDate(d);
            if (d > todayDateObj || (minDateObj && d < minDateObj) || usedDates.has(iso)) return;
            setDate(iso); setOpen(false);
          }}
          disabled={(d) => d > todayDateObj || (minDateObj && d < minDateObj) || usedDates.has(isoFromDate(d))}
          className="p-3 !bg-transparent"
          classNames={{
            month_grid:      "w-full",
            caption_label:   "text-sm font-semibold text-zinc-100",
            weekday:         "text-zinc-400 rounded-md w-9 font-medium text-[0.75rem]",
            today:           "bg-blue-500/10 rounded-md data-[selected=true]:rounded-none",
            outside:         "text-zinc-600 opacity-40",
            disabled:        "text-zinc-600 opacity-35",
            button_previous: "inline-flex items-center justify-center h-8 w-8 rounded-xl border border-zinc-700 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800 p-0",
            button_next:     "inline-flex items-center justify-center h-8 w-8 rounded-xl border border-zinc-700 bg-zinc-900/60 text-zinc-200 hover:bg-zinc-800 p-0",
          }}
        />
      </div>
    </>
  );

  if (isMobile) {
    return (
      <Dialog open={open} onOpenChange={(v) => { if (v) blur(); setOpen(v); }}>
        <DialogTrigger asChild>{Trigger}</DialogTrigger>
        <DialogContent
          showCloseButton={false}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className="p-0 border border-zinc-700/60 bg-zinc-950/95 backdrop-blur-xl shadow-2xl rounded-3xl w-[calc(100vw-1.25rem)] max-w-[420px] max-h-[calc(100dvh-1.25rem)] overflow-hidden"
        >
          <DialogTitle className="sr-only">Pick a date</DialogTitle>
          <div className="max-h-[calc(100dvh-1.25rem)] overflow-y-auto overscroll-contain">{Cal}</div>
          <div className="p-3 border-t border-zinc-800">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="w-full h-11 rounded-2xl bg-zinc-800/60 border border-zinc-700/50 text-zinc-100 text-sm font-medium hover:bg-zinc-800/80 transition"
            >
              Close
            </button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Popover open={open} onOpenChange={(v) => { if (v) blur(); setOpen(v); }} modal>
      <PopoverTrigger asChild>{Trigger}</PopoverTrigger>
      <PopoverContent
        align="start" side="bottom" sideOffset={10} collisionPadding={16} sticky="always"
        onOpenAutoFocus={(e) => e.preventDefault()}
        className="z-[9999] w-[min(360px,calc(100vw-2rem))] p-0 overflow-hidden rounded-2xl border border-zinc-700/60 bg-zinc-950/95 shadow-2xl backdrop-blur-xl"
      >
        {Cal}
      </PopoverContent>
    </Popover>
  );
}
