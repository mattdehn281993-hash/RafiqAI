import { useParams } from "react-router";

/**
 * Screens that work both inside a textbook class (/class/:classId/…) and in the
 * class-free foundations area (/learn/…). `base` is the path prefix to link with.
 */
export function useBase(): { classId: string | undefined; base: string } {
  const { classId } = useParams();
  return { classId, base: classId ? `/class/${classId}` : "/learn" };
}
