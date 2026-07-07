import { useLocalSearchParams } from "expo-router";

import { WorkoutDetail } from "@/src/components/workout-detail";

export default function PlanWorkout() {
  const { planId } = useLocalSearchParams<{ planId: string }>();
  return <WorkoutDetail mode="plan" keyValue={planId as string} />;
}
