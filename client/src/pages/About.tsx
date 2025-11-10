import { useTranslation } from "react-i18next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Target, History, Users } from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";

export default function About() {
  const { t } = useTranslation();

  const sections = [
    {
      icon: History,
      title: t("about.history.title"),
      content: t("about.history.content"),
    },
    {
      icon: Target,
      title: t("about.mission.title"),
      content: t("about.mission.content"),
    },
    {
      icon: Users,
      title: t("about.team.title"),
      content: t("about.team.content"),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="py-20 bg-gradient-to-br from-background via-background to-primary/5">
          <div className="container text-center">
            <h1 className="text-4xl md:text-6xl font-bold mb-6 text-primary">
              {t("about.title")}
            </h1>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Discover the story behind Montreal's premier Latin dance studio
            </p>
          </div>
        </section>

        {/* Content Sections */}
        <section className="py-20">
          <div className="container">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {sections.map((section, index) => {
                const Icon = section.icon;
                return (
                  <Card key={index} className="border-border">
                    <CardHeader>
                      <div className="mb-4">
                        <div className="p-3 rounded-full bg-primary/10 w-fit">
                          <Icon className="h-8 w-8 text-primary" />
                        </div>
                      </div>
                      <CardTitle className="text-2xl">{section.title}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-muted-foreground leading-relaxed">
                        {section.content}
                      </p>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </div>
        </section>

        {/* Values Section */}
        <section className="py-20 bg-card">
          <div className="container">
            <div className="text-center mb-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-4 text-primary">
                Our Values
              </h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
                What makes Alliance Dance Studio special
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {["Excellence", "Community", "Passion", "Innovation"].map((value, index) => (
                <div key={index} className="text-center p-6">
                  <div className="text-4xl font-bold text-primary mb-2">{value}</div>
                  <p className="text-sm text-muted-foreground">
                    We believe in {value.toLowerCase()} in everything we do
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
