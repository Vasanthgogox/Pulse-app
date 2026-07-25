/**
 * Campaign History — Story Campaign Studio with the history reel selected.
 * Same layout as /reach (ticker, KPIs, horizontal reel, real story post preview).
 */
import ReachStudioScreen from "@/features/reach/screens/ReachHomeScreen";

export default function ReachHistoryScreen() {
  return <ReachStudioScreen initialReelFilter="history" />;
}
