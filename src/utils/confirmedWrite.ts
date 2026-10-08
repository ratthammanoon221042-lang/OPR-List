import { ParkingPermit } from '../types/parking';

export type WriteOutcome =
  | { status: 'saved'; list: ParkingPermit[] }
  /** The sheet definitely did not take the change (or the script refused it) */
  | { status: 'failed'; error: unknown }
  /** No reply to the write and no way to read the sheet either: the outcome is not known yet */
  | { status: 'unknown'; error: unknown };

/**
 * Sends one write to the sheet and works out what really happened.
 *
 * A write can run in the sheet and still come back as a timeout, a dropped connection or an
 * error status such as 404. So after an unclear answer the sheet itself is read: if the change is
 * there it counts as saved. Only when it is not there is the write sent again (add / update /
 * delete by id are safe to repeat). Nothing is ever re-sent blindly after a long wait.
 */
export async function attemptWrite(deps: {
  call: () => Promise<ParkingPermit[]>;
  readFresh: () => Promise<ParkingPermit[]>;
  /** True for errors that leave the outcome open (lost reply, error status) */
  isUnclear: (error: unknown) => boolean;
  /** True when the given sheet contents show the change was applied */
  verify: (list: ParkingPermit[]) => boolean;
}): Promise<WriteOutcome> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return { status: 'saved', list: await deps.call() };
    } catch (error) {
      if (!deps.isUnclear(error)) return { status: 'failed', error };
      lastError = error;
    }

    let current: ParkingPermit[];
    try {
      current = await deps.readFresh();
    } catch {
      return { status: 'unknown', error: lastError };
    }
    if (deps.verify(current)) return { status: 'saved', list: current };
    // The sheet did not get it, so sending it again cannot create a duplicate
  }

  return { status: 'failed', error: lastError };
}
