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

            const payload = `event: availability.updated\ndata: ${JSON.stringify({
                slug,
                at: new Date().toISOString(),
            })}\n\n`;
            clients.forEach((response) => response.write(payload));
        },

        broadcastAdmin(eventName = "booking.updated") {
            if (adminSseClients.size === 0) {
                return;
            }
            const payload = `event: ${eventName}\ndata: ${JSON.stringify({
                at: new Date().toISOString(),
            })}\n\n`;
            adminSseClients.forEach((response) => response.write(payload));
        },

        broadcastClientAvailability(clientId) {
            listBookingLinksForClient(clientId).forEach((link) =>
                this.broadcastAvailability(link.slug),
            );
            this.broadcastAdmin("connections.updated");
        },
    };
}
