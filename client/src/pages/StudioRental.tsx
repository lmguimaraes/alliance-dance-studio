import { useState } from "react";
import { useTranslation } from "react-i18next";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { toast } from "sonner";
import { Loader2, Check, X } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function StudioRental() {
  const { t } = useTranslation();
  const [selectedStudio, setSelectedStudio] = useState<number | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [selectedTimeSlot, setSelectedTimeSlot] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    specialRequests: "",
  });

  const { data: studios, isLoading: studiosLoading } = trpc.studios.list.useQuery();
  const { data: bookings, isLoading: bookingsLoading } = trpc.bookings.getByStudioAndDate.useQuery(
    {
      studioId: selectedStudio!,
      date: selectedDate?.toISOString() || new Date().toISOString(),
    },
    { enabled: !!selectedStudio && !!selectedDate }
  );

  const createBooking = trpc.bookings.create.useMutation({
    onSuccess: () => {
      toast.success(t("studioRental.bookingForm.success"));
      setFormData({ name: "", email: "", phone: "", specialRequests: "" });
      setSelectedTimeSlot(null);
    },
    onError: () => {
      toast.error(t("studioRental.bookingForm.error"));
    },
  });

  const selectedStudioData = studios?.find((s) => s.id === selectedStudio);

  // Generate time slots (9 AM - 10 PM)
  const timeSlots = Array.from({ length: 13 }, (_, i) => {
    const hour = i + 9;
    return `${hour.toString().padStart(2, "0")}:00`;
  });

  const isTimeSlotBooked = (time: string) => {
    if (!bookings) return false;
    return bookings.some(
      (booking) =>
        booking.startTime === time &&
        (booking.status === "pending" || booking.status === "confirmed")
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedStudio || !selectedDate || !selectedTimeSlot) {
      toast.error("Please select a studio, date, and time slot");
      return;
    }

    if (!formData.name || !formData.email) {
      toast.error("Please fill in all required fields");
      return;
    }

    const endHour = parseInt(selectedTimeSlot.split(":")[0]) + 1;
    const endTime = `${endHour.toString().padStart(2, "0")}:00`;

    createBooking.mutate({
      studioId: selectedStudio,
      userName: formData.name,
      userEmail: formData.email,
      userPhone: formData.phone || "",
      bookingDate: selectedDate.toISOString(),
      startTime: selectedTimeSlot,
      endTime: endTime,
      specialRequests: formData.specialRequests || "",
      totalPrice: selectedStudioData?.hourlyRate || 0,
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="py-20 bg-gradient-to-br from-background via-background to-primary/5">
          <div className="container text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 text-primary">
              {t("studioRental.title")}
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              {t("studioRental.subtitle")}
            </p>
          </div>
        </section>

        {/* Booking Interface */}
        <section className="py-20">
          <div className="container">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Step 1: Select Studio */}
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="text-primary">
                    1. {t("studioRental.selectStudio")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {studiosLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {studios?.map((studio) => (
                        <button
                          key={studio.id}
                          onClick={() => setSelectedStudio(studio.id)}
                          className={`w-full p-4 rounded-lg border-2 transition-all text-left ${
                            selectedStudio === studio.id
                              ? "border-primary bg-primary/10"
                              : "border-border hover:border-primary/50"
                          }`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold">{studio.name}</h3>
                            {selectedStudio === studio.id && (
                              <Check className="h-5 w-5 text-primary" />
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">
                            {studio.description}
                          </p>
                          <p className="text-sm font-medium text-primary">
                            ${(studio.hourlyRate / 100).toFixed(2)} {t("studioRental.price.perHour")}
                          </p>
                        </button>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Step 2: Select Date & Time */}
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="text-primary">
                    2. {t("studioRental.selectDate")} & {t("studioRental.selectTime")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!selectedStudio ? (
                    <p className="text-muted-foreground text-center py-8">
                      Please select a studio first
                    </p>
                  ) : (
                    <div className="space-y-6">
                      <Calendar
                        mode="single"
                        selected={selectedDate}
                        onSelect={setSelectedDate}
                        disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                        className="rounded-md border border-border"
                      />

                      {selectedDate && (
                        <div>
                          <h4 className="font-semibold mb-3">Available Time Slots</h4>
                          {bookingsLoading ? (
                            <div className="flex justify-center py-4">
                              <Loader2 className="h-6 w-6 animate-spin text-primary" />
                            </div>
                          ) : (
                            <div className="grid grid-cols-3 gap-2">
                              {timeSlots.map((time) => {
                                const isBooked = isTimeSlotBooked(time);
                                return (
                                  <button
                                    key={time}
                                    onClick={() => !isBooked && setSelectedTimeSlot(time)}
                                    disabled={isBooked}
                                    className={`p-2 rounded text-sm font-medium transition-all ${
                                      selectedTimeSlot === time
                                        ? "bg-primary text-primary-foreground"
                                        : isBooked
                                        ? "bg-muted text-muted-foreground cursor-not-allowed"
                                        : "bg-card border border-border hover:border-primary"
                                    }`}
                                  >
                                    {time}
                                    {isBooked && <X className="h-3 w-3 inline ml-1" />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Step 3: Booking Form */}
              <Card className="border-border">
                <CardHeader>
                  <CardTitle className="text-primary">
                    3. {t("studioRental.bookingForm.title")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {!selectedTimeSlot ? (
                    <p className="text-muted-foreground text-center py-8">
                      Please select a date and time slot
                    </p>
                  ) : (
                    <form onSubmit={handleSubmit} className="space-y-4">
                      <div>
                        <Label htmlFor="name">{t("studioRental.bookingForm.name")} *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                          required
                        />
                      </div>

                      <div>
                        <Label htmlFor="email">{t("studioRental.bookingForm.email")} *</Label>
                        <Input
                          id="email"
                          type="email"
                          value={formData.email}
                          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                          required
                        />
                      </div>

                      <div>
                        <Label htmlFor="phone">{t("studioRental.bookingForm.phone")}</Label>
                        <Input
                          id="phone"
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        />
                      </div>

                      <div>
                        <Label htmlFor="requests">
                          {t("studioRental.bookingForm.specialRequests")}
                        </Label>
                        <Textarea
                          id="requests"
                          value={formData.specialRequests}
                          onChange={(e) =>
                            setFormData({ ...formData, specialRequests: e.target.value })
                          }
                          rows={3}
                        />
                      </div>

                      {selectedStudioData && (
                        <div className="p-4 bg-primary/10 rounded-lg">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold">
                              {t("studioRental.price.total")}:
                            </span>
                            <span className="text-xl font-bold text-primary">
                              ${(selectedStudioData.hourlyRate / 100).toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )}

                      <Button
                        type="submit"
                        className="w-full"
                        disabled={createBooking.isPending}
                      >
                        {createBooking.isPending ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            {t("studioRental.bookingForm.submitting")}
                          </>
                        ) : (
                          t("studioRental.bookingForm.submit")
                        )}
                      </Button>
                    </form>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
