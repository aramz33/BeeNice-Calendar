import { useMemo } from "react";
import { AppChrome } from "@mvp/components/AppChrome";
import { ScheduleXWeek } from "@mvp/components/calendar/ScheduleXWeek";
import {
  currentWeekStartPlainDate,
  forwardMaxPlainDate,
  slotsToEvents,
} from "@mvp/lib/schedule-x";
import { BookingConfirmDialog } from "./caller/BookingConfirmDialog";
import { ClientFilter } from "./caller/ClientFilter";
import { ProspectForm } from "./caller/ProspectForm";
import { ReschedulingTasksList } from "./caller/ReschedulingTasksList";
import { ReschedulingTasksModal } from "./caller/ReschedulingTasksModal";
import { useCallerController } from "./caller/useCallerController";

export function CallerPage() {
  const {
    workspaces,
    selectedSlug,
    availability,
    openTasks,
    tasks,
    loadingWorkspaces,
    loadingAvailability,
    submitting,
    showTasksModal,
    dismissModal,
    showConfirmDialog,
    setShowConfirmDialog,
    selectedSlot,
    setSelectedSlot,
    selectedSlotLabel,
    salutation,
    setSalutation,
    prospectFirstName,
    setProspectFirstName,
    prospectLastName,
    setProspectLastName,
    prospectEmail,
    setProspectEmail,
    companyName,
    setCompanyName,
    notes,
    setNotes,
    sourceTask,
    timezone,
    availabilityWeekStartIso,
    handleWorkspaceSelect,
    handleTaskSelect,
    resetTask,
    handleAvailabilityWeekChange,
    handleSubmit,
  } = useCallerController();

  const slotEvents = useMemo(
    () => slotsToEvents(availability, selectedSlot),
    [availability, selectedSlot],
  );

  return (
    <AppChrome title="Caller">
      <div className="flex min-h-0 flex-1 gap-6">
        {/* Panel gauche */}
        <aside className="flex w-64 shrink-0 flex-col gap-4 lg:w-72">
          <ClientFilter
            workspaces={workspaces}
            selectedSlug={selectedSlug}
            onSelect={handleWorkspaceSelect}
            loading={loadingWorkspaces}
          />

          {selectedSlug && (
            <>
              <ProspectForm
                salutation={salutation}
                setSalutation={setSalutation}
                prospectFirstName={prospectFirstName}
                setProspectFirstName={setProspectFirstName}
                prospectLastName={prospectLastName}
                setProspectLastName={setProspectLastName}
                prospectEmail={prospectEmail}
                setProspectEmail={setProspectEmail}
                companyName={companyName}
                setCompanyName={setCompanyName}
                notes={notes}
                setNotes={setNotes}
                selectedSlotLabel={selectedSlotLabel}
                sourceTask={sourceTask}
                onResetTask={resetTask}
                onOpenConfirm={() => setShowConfirmDialog(true)}
                submitting={submitting}
              />

              <ReschedulingTasksList
                tasks={tasks}
                onReposition={(task) => handleTaskSelect(task)}
                timezone={timezone}
              />
            </>
          )}
        </aside>

        {/* Zone principale : calendrier */}
        <main className="caller-calendar flex min-h-0 min-w-0 flex-1 flex-col">
          {!selectedSlug ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border-2 border-dashed border-[#001E5B]/10">
              <p className="text-[#001E5B]/48">
                Sélectionnez un client pour voir les disponibilités
              </p>
            </div>
          ) : (
            <ScheduleXWeek
              events={slotEvents}
              timezone={timezone}
              weekStartIso={availabilityWeekStartIso}
              onWeekStartChange={handleAvailabilityWeekChange}
              onEventClick={(event) => setSelectedSlot(String(event.slotIso))}
              minDate={currentWeekStartPlainDate()}
              maxDate={forwardMaxPlainDate()}
              loading={loadingAvailability}
            />
          )}
        </main>
      </div>

      {/* Modal tâches (première connexion de session) */}
      {showTasksModal && (
        <ReschedulingTasksModal
          tasks={openTasks}
          onReposition={(task) => handleTaskSelect(task, true)}
          onDismiss={dismissModal}
        />
      )}

      {/* Dialog de confirmation */}
      <BookingConfirmDialog
        open={showConfirmDialog}
        onClose={() => setShowConfirmDialog(false)}
        onConfirm={() => void handleSubmit()}
        submitting={submitting}
        salutation={salutation}
        prospectFirstName={prospectFirstName}
        prospectLastName={prospectLastName}
        prospectEmail={prospectEmail}
        companyName={companyName}
        notes={notes}
        slotLabel={selectedSlotLabel ?? ""}
      />
    </AppChrome>
  );
}
