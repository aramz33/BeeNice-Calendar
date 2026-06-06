export function createNotificationsModule({listBookingLinksForClient}) {
    const sseClients = new Map();
    const adminSseClients = new Set();

    return {
        addSseClient(slug, response) {
            if (!sseClients.has(slug)) {
                sseClients.set(slug, new Set());
            }
            sseClients.get(slug).add(response);
        },

        removeSseClient(slug, response) {
            sseClients.get(slug)?.delete(response);
        },

        addAdminSseClient(response) {
            adminSseClients.add(response);
        },

        removeAdminSseClient(response) {
            adminSseClients.delete(response);
        },

        broadcastAvailability(slug) {
            const clients = sseClients.get(slug);
            if (!clients || clients.size === 0) {
                return;
            }

            clients.forEach((response) =>
                response.writeSSE({
                    event: "availability.updated",
                    data: JSON.stringify({ slug, at: new Date().toISOString() }),
                }),
            );
        },

        broadcastAdmin(eventName = "booking.updated") {
            if (adminSseClients.size === 0) {
                return;
            }
            adminSseClients.forEach((response) =>
                response.writeSSE({
                    event: eventName,
                    data: JSON.stringify({ at: new Date().toISOString() }),
                }),
            );
        },

        broadcastClientAvailability(clientId) {
            listBookingLinksForClient(clientId).forEach((link) =>
                this.broadcastAvailability(link.slug),
            );
            this.broadcastAdmin("connections.updated");
        },
    };
}
