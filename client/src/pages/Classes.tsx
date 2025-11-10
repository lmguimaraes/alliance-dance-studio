import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Users, TrendingUp } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Link } from "wouter";

export default function Classes() {
  const { t } = useTranslation();

  const classes = [
    {
      name: "Salsa Fundamentals",
      level: "Beginner",
      duration: "60 min",
      capacity: "12 students",
      schedule: "Mon & Wed, 7:00 PM",
      description: "Learn the basics of Salsa dancing with our expert instructors. Perfect for absolute beginners.",
    },
    {
      name: "Bachata Intermediate",
      level: "Intermediate",
      duration: "75 min",
      capacity: "10 students",
      schedule: "Tue & Thu, 8:00 PM",
      description: "Take your Bachata skills to the next level with advanced techniques and styling.",
    },
    {
      name: "Merengue Express",
      level: "All Levels",
      duration: "45 min",
      capacity: "15 students",
      schedule: "Fri, 6:30 PM",
      description: "High-energy Merengue class suitable for all skill levels. Great cardio workout!",
    },
    {
      name: "Latin Fusion",
      level: "Advanced",
      duration: "90 min",
      capacity: "8 students",
      schedule: "Sat, 4:00 PM",
      description: "Combine multiple Latin dance styles in this challenging and creative class.",
    },
    {
      name: "Private Lessons",
      level: "Customized",
      duration: "60 min",
      capacity: "1-2 students",
      schedule: "By Appointment",
      description: "One-on-one instruction tailored to your specific goals and skill level.",
    },
    {
      name: "Wedding Dance",
      level: "All Levels",
      duration: "60 min",
      capacity: "2 students",
      schedule: "By Appointment",
      description: "Create a memorable first dance for your special day with personalized choreography.",
    },
  ];

  const getLevelColor = (level: string) => {
    switch (level.toLowerCase()) {
      case "beginner":
        return "text-green-500";
      case "intermediate":
        return "text-yellow-500";
      case "advanced":
        return "text-red-500";
      default:
        return "text-primary";
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="py-20 bg-gradient-to-br from-background via-background to-secondary/5">
          <div className="container text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 text-primary">
              {t("classes.title")}
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              {t("classes.subtitle")}
            </p>
          </div>
        </section>

        {/* Classes Grid */}
        <section className="py-20">
          <div className="container">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {classes.map((classItem, index) => (
                <Card key={index} className="border-border hover:border-primary transition-colors">
                  <CardHeader>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-semibold ${getLevelColor(classItem.level)}`}>
                        {classItem.level}
                      </span>
                      <TrendingUp className="h-4 w-4 text-primary" />
                    </div>
                    <CardTitle className="text-2xl">{classItem.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground mb-4">{classItem.description}</p>
                    
                    <div className="space-y-2 mb-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Clock className="h-4 w-4 text-primary" />
                        <span>{classItem.duration}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <Users className="h-4 w-4 text-primary" />
                        <span>{classItem.capacity}</span>
                      </div>
                      <div className="text-sm font-medium text-primary">
                        {classItem.schedule}
                      </div>
                    </div>

                    <Link href="/studio-rental">
                      <Button className="w-full">Book Now</Button>
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-20 bg-card">
          <div className="container text-center">
            <h2 className="text-3xl md:text-4xl font-bold mb-6">
              Not Sure Which Class Is Right for You?
            </h2>
            <p className="text-lg text-muted-foreground mb-8 max-w-2xl mx-auto">
              Contact us for a free consultation and we'll help you find the perfect class
            </p>
            <Link href="/contact">
              <Button size="lg" variant="outline" className="text-lg px-8">
                Contact Us
              </Button>
            </Link>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
