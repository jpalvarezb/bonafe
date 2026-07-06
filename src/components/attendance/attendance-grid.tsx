"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { enqueue, flushOutbox } from "@/lib/offline/outbox";
import { newId } from "@/lib/ids";

type AttendanceStatus = "present" | "half_day" | "absent" | "sick" | "leave";

const STATUSES: AttendanceStatus[] = [
  "present",
  "half_day",
  "absent",
  "sick",
  "leave",
];

type Row = {
  workerId: string;
  name: string;
  code: string | null;
  status: AttendanceStatus | null;
  hoursWorked: string | null;
  notes: string | null;
};

type RowState = {
  status: AttendanceStatus | null;
  hoursWorked: string;
  notes: string;
  submitting: boolean;
  saveError: boolean;
  localPending: boolean;
};

type Props = {
  readonly orgSlug: string;
  readonly date: string;
  readonly rows: Row[];
};

function shiftDate(iso: string, deltaDays: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deltaDays);
  return d.toISOString().slice(0, 10);
}

const statusChipClass: Record<AttendanceStatus, string> = {
  present:
    "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100",
  half_day:
    "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-100",
  absent: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-100",
  sick: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-100",
  leave:
    "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-100",
};

export function AttendanceGrid({ orgSlug, date, rows }: Props) {
  const t = useTranslations("attendance");
  const tOffline = useTranslations("offline");
  const router = useRouter();

  const [entries, setEntries] = useState<Record<string, RowState>>(() =>
    Object.fromEntries(
      rows.map((row) => [
        row.workerId,
        {
          status: row.status,
          hoursWorked: row.hoursWorked ?? "",
          notes: row.notes ?? "",
          submitting: false,
          saveError: false,
          localPending: false,
        },
      ]),
    ),
  );

  const summary = useMemo(() => {
    const counts: Record<AttendanceStatus, number> = {
      present: 0,
      half_day: 0,
      absent: 0,
      sick: 0,
      leave: 0,
    };
    let unmarked = 0;
    for (const row of rows) {
      const status = entries[row.workerId]?.status ?? null;
      if (status) counts[status] += 1;
      else unmarked += 1;
    }
    return { counts, unmarked };
  }, [entries, rows]);

  function updateEntry(workerId: string, patch: Partial<RowState>) {
    setEntries((prev) => ({
      ...prev,
      [workerId]: { ...prev[workerId], ...patch },
    }));
  }

  async function saveRow(
    workerId: string,
    status: AttendanceStatus,
    hoursWorked: string,
    notes: string,
  ) {
    updateEntry(workerId, {
      status,
      submitting: true,
      saveError: false,
    });
    try {
      await enqueue(orgSlug, "attendance.upsert", {
        id: newId(),
        workerId,
        date,
        status,
        hoursWorked: hoursWorked || undefined,
        notes: notes || undefined,
      });
      if (navigator.onLine) {
        await flushOutbox(orgSlug).catch(() => null);
        router.refresh();
        updateEntry(workerId, { localPending: false });
      } else {
        // Offline: navigation/refresh would fail without a network; the row
        // shows its pending style instead until the outbox flushes later.
        updateEntry(workerId, { localPending: true });
      }
    } catch {
      // enqueue() zod-rejects invalid payloads before anything is stored.
      updateEntry(workerId, { saveError: true });
    } finally {
      updateEntry(workerId, { submitting: false });
    }
  }

  function goToDate(nextDate: string) {
    router.push({
      pathname: `/o/${orgSlug}/attendance`,
      query: { date: nextDate },
    });
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => goToDate(shiftDate(date, -1))}>
          {t("nav.prev")}
        </Button>
        <Input
          type="date"
          value={date}
          onChange={(e) => e.target.value && goToDate(e.target.value)}
          className="w-40"
        />
        <Button variant="outline" size="sm" onClick={() => goToDate(shiftDate(date, 1))}>
          {t("nav.next")}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => goToDate(new Date().toISOString().slice(0, 10))}
        >
          {t("nav.today")}
        </Button>
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        {STATUSES.map((status) => (
          <span
            key={status}
            className={`rounded-full px-2 py-0.5 font-medium ${statusChipClass[status]}`}
          >
            {t(`statuses.${status}`)}: {summary.counts[status]}
          </span>
        ))}
        {summary.unmarked > 0 && (
          <span className="rounded-full bg-muted px-2 py-0.5 font-medium text-muted-foreground">
            {t("summary.unmarked")}: {summary.unmarked}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((row) => {
          const entry = entries[row.workerId];
          return (
            <Card key={row.workerId}>
              <CardContent className="flex flex-col gap-3 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{row.name}</p>
                    {row.code && (
                      <p className="truncate text-xs text-muted-foreground">
                        {row.code}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {STATUSES.map((status) => {
                      const active = entry.status === status;
                      return (
                        <Button
                          key={status}
                          type="button"
                          size="sm"
                          variant={active ? "default" : "outline"}
                          disabled={entry.submitting}
                          onClick={() =>
                            saveRow(
                              row.workerId,
                              status,
                              entry.hoursWorked,
                              entry.notes,
                            )
                          }
                        >
                          {t(`statuses.${status}`)}
                        </Button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-[10rem_1fr_auto]">
                  <Input
                    type="number"
                    min="0"
                    step="0.25"
                    placeholder={t("hoursPlaceholder")}
                    value={entry.hoursWorked}
                    onChange={(e) =>
                      updateEntry(row.workerId, {
                        hoursWorked: e.target.value,
                      })
                    }
                  />
                  <Input
                    placeholder={t("notesPlaceholder")}
                    value={entry.notes}
                    onChange={(e) =>
                      updateEntry(row.workerId, { notes: e.target.value })
                    }
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={entry.submitting}
                    onClick={() =>
                      saveRow(
                        row.workerId,
                        entry.status ?? "present",
                        entry.hoursWorked,
                        entry.notes,
                      )
                    }
                  >
                    {t("save")}
                  </Button>
                </div>

                {entry.localPending && (
                  <p className="rounded-md bg-amber-100 px-3 py-1.5 text-xs text-amber-800 dark:bg-amber-900 dark:text-amber-100">
                    {tOffline("pendingNote")}
                  </p>
                )}
                {entry.saveError && (
                  <p className="text-xs text-destructive">
                    {tOffline("saveError")}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
