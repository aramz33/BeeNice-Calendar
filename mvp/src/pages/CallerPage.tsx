import { AppChrome } from "@mvp/components/AppChrome";
import { SlotPicker } from "@mvp/components/SlotPicker";
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
    prospectName,
    setProspectName,
    prospectEmail,
    setProspectEmail,
    companyName,
    setCompanyName,
    notes,
    setNotes,
    sourceTask,
    timezone,
    hasPreviousAvailabilityWeek,
    hasNextAvailabilityWeek,
    handleWorkspaceSelect,
    handleTaskSelect,
    resetTask,
    handlePreviousAvailabilityWeek,
    handleNextAvailabilityWeek,
    handleSubmit,
  } = useCallerController();

  return (
    <AppChrome title="Colleur">
      <div className="flex gap-6">
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
                prospectName={prospectName}
                setProspectName={setProspectName}
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
        <main className="min-w-0 flex-1">
          {!selectedSlug ? (
            <div className="flex h-64 items-center justify-center rounded-2xl border-2 border-dashed border-[#001E5B]/10">
              <p className="text-[#001E5B]/48">Sélectionnez un client pour voir les disponibilités</p>
            </div>
          ) : (
            <SlotPicker
              availability={availability}
              selectedSlot={selectedSlot}
              onSelect={setSelectedSlot}
              loading={loadingAvailability}
              onPreviousWeek={handlePreviousAvailabilityWeek}
              onNextWeek={handleNextAvailabilityWeek}
              hasPreviousWeek={hasPreviousAvailabilityWeek}
              hasNextWeek={hasNextAvailabilityWeek}
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
        prospectName={prospectName}
        prospectEmail={prospectEmail}
        companyName={companyName}
        notes={notes}
        slotLabel={selectedSlotLabel ?? ""}
      />
    </AppChrome>
  );
}
