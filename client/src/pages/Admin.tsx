import { Check, Loader2, LockKeyhole, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAuth } from "@/_core/hooks/useAuth";
import Footer from "@/components/Footer";
import Navbar from "@/components/Navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";

function statusBadge(status: "pending" | "confirmed" | "cancelled") {
  if (status === "confirmed") return <Badge>Confirmed</Badge>;
  if (status === "cancelled") return <Badge variant="destructive">Cancelled</Badge>;
  return <Badge variant="secondary">Pending</Badge>;
}

export default function Admin() {
  const { t } = useTranslation();
  const { user, loading, isAuthenticated } = useAuth();
  const utils = trpc.useUtils();
  const bookingsQuery = trpc.bookings.list.useQuery(undefined, {
    enabled: isAuthenticated && user?.role === "admin",
  });
  const updateStatus = trpc.bookings.updateStatus.useMutation({
    onSuccess: async () => {
      toast.success("Booking status updated.");
      await utils.bookings.list.invalidate();
    },
    onError: error => toast.error(error.message || "Unable to update booking."),
  });

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="brand-shell min-h-screen bg-background text-foreground">
        <Navbar />
        <main className="container flex min-h-[70vh] items-center justify-center py-16">
          <div className="max-w-md rounded-[2rem] border border-border bg-card p-8 text-center">
            <h1 className="text-2xl font-semibold">Authentication required</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Sign in to access the reservation dashboard.
            </p>
            <Button
              className="mt-6 rounded-full"
              onClick={() => window.location.assign(getLoginUrl())}
            >
              Sign in
            </Button>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (user?.role !== "admin") {
    return (
      <div className="brand-shell min-h-screen bg-background text-foreground">
        <Navbar />
        <main className="container flex min-h-[70vh] items-center justify-center py-16">
          <div className="max-w-md rounded-[2rem] border border-border bg-card p-8 text-center">
            <h1 className="text-2xl font-semibold">Access denied</h1>
            <p className="mt-3 text-sm text-muted-foreground">
              This account does not have administrator access.
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const bookings = bookingsQuery.data ?? [];

  return (
    <div className="brand-shell min-h-screen bg-background text-foreground">
      <Navbar />
      <main className="container py-12 md:py-16">
        <div className="mb-8">
          <p className="eyebrow">Operations</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight">
            {t("admin.title")}
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Paid reservation rows are controlled by verified Stripe payment
            events. Manual actions remain available only for legacy bookings.
          </p>
        </div>

        <section className="overflow-hidden rounded-[2rem] border border-border bg-card">
          {bookingsQuery.isLoading ? (
            <div className="flex items-center gap-2 p-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Loading reservations
            </div>
          ) : bookingsQuery.error ? (
            <p className="p-8 text-sm text-destructive">
              {bookingsQuery.error.message}
            </p>
          ) : bookings.length === 0 ? (
            <p className="p-8 text-sm text-muted-foreground">No bookings found.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-border bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-5 py-4">Reference</th>
                    <th className="px-5 py-4">Customer</th>
                    <th className="px-5 py-4">Studio</th>
                    <th className="px-5 py-4">Date</th>
                    <th className="px-5 py-4">Time</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bookings.map(booking => {
                    const stripeManaged = Boolean(booking.reservationId);
                    return (
                      <tr key={booking.id} className="border-b border-border/70 last:border-0">
                        <td className="px-5 py-4 font-mono text-xs">
                          {booking.reservationId || `legacy-${booking.id}`}
                        </td>
                        <td className="px-5 py-4">
                          <div className="font-medium">{booking.userName}</div>
                          <div className="text-xs text-muted-foreground">
                            {booking.userEmail}
                          </div>
                        </td>
                        <td className="px-5 py-4">Studio {booking.studioId}</td>
                        <td className="px-5 py-4">
                          {new Date(booking.bookingDate).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-4">
                          {booking.startTime}-{booking.endTime}
                        </td>
                        <td className="px-5 py-4">{statusBadge(booking.status)}</td>
                        <td className="px-5 py-4">
                          {stripeManaged ? (
                            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                              <LockKeyhole className="h-3.5 w-3.5" /> Stripe-managed
                            </span>
                          ) : booking.status === "pending" ? (
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={updateStatus.isPending}
                                onClick={() =>
                                  updateStatus.mutate({
                                    id: booking.id,
                                    status: "confirmed",
                                  })
                                }
                              >
                                <Check className="mr-1 h-4 w-4" /> Confirm
                              </Button>
                              <Button
                                size="sm"
                                variant="destructive"
                                disabled={updateStatus.isPending}
                                onClick={() =>
                                  updateStatus.mutate({
                                    id: booking.id,
                                    status: "cancelled",
                                  })
                                }
                              >
                                <X className="mr-1 h-4 w-4" /> Cancel
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">No action</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
      <Footer />
    </div>
  );
}
