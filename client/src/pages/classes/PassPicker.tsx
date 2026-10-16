import { useTranslation } from "react-i18next";
import Dialog from "@/components/Dialog";
import { useFormat } from "@/lib/format";
import type { ScheduledClass } from "./classSchedule";
import { PassList, type Pass } from "./PassShop";

type Props = {
  passes: Pass[];
  forClass: ScheduledClass | null;
  onClose: () => void;
};

export default function PassPicker({ passes, forClass, onClose }: Props) {
  const { t } = useTranslation();
  const format = useFormat();

  return (
    <Dialog
      open={forClass !== null}
      onClose={onClose}
      title={t("classes.passes.pickTitle")}
      subtitle={
        forClass
          ? `${forClass.title}, ${format.time(forClass.startTime)}`
          : undefined
      }
    >
      <div className="pass-picker">
        <PassList passes={passes} compact />
        <p className="pass-picker__note">{t("classes.passes.stripeNote")}</p>
      </div>
    </Dialog>
  );
}
