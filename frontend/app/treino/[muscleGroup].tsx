import { useLocalSearchParams } from "expo-router";

import { WorkoutDetail } from "@/src/components/workout-detail";

export default function GroupWorkout() {
  const { muscleGroup } = useLocalSearchParams<{ muscleGroup: string }>();
  return <WorkoutDetail mode="group" keyValue={muscleGroup as string} />;
}
