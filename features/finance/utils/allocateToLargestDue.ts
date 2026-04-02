export interface LargestDueTripAllocation {
  tripId: string;
  sales: number;
  paid: number;
}

interface HeapEntry {
  tripId: string;
  due: number;
  order: number;
  version: number;
}

function compareEntries(a: HeapEntry, b: HeapEntry): number {
  if (a.due !== b.due) return b.due - a.due;
  return a.order - b.order;
}

function heapPush(heap: HeapEntry[], entry: HeapEntry) {
  heap.push(entry);
  let index = heap.length - 1;
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (compareEntries(heap[parent], heap[index]) <= 0) break;
    [heap[parent], heap[index]] = [heap[index], heap[parent]];
    index = parent;
  }
}

function heapPop(heap: HeapEntry[]): HeapEntry | undefined {
  if (heap.length === 0) return undefined;
  const top = heap[0];
  const tail = heap.pop();
  if (heap.length > 0 && tail) {
    heap[0] = tail;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let smallest = index;

      if (left < heap.length && compareEntries(heap[smallest], heap[left]) > 0) {
        smallest = left;
      }
      if (right < heap.length && compareEntries(heap[smallest], heap[right]) > 0) {
        smallest = right;
      }
      if (smallest === index) break;
      [heap[index], heap[smallest]] = [heap[smallest], heap[index]];
      index = smallest;
    }
  }
  return top;
}

export function allocateAmountsToLargestDueTrips(
  trips: LargestDueTripAllocation[],
  amounts: number[],
): Record<string, number> {
  const paidByTripId: Record<string, number> = {};
  const salesByTripId = new Map<string, number>();
  const versionByTripId = new Map<string, number>();
  const orderByTripId = new Map<string, number>();
  const heap: HeapEntry[] = [];

  for (let i = 0; i < trips.length; i++) {
    const trip = trips[i];
    const initialPaid = Number(trip.paid ?? 0);
    const sales = Number(trip.sales ?? 0);
    paidByTripId[trip.tripId] = initialPaid;
    salesByTripId.set(trip.tripId, sales);
    versionByTripId.set(trip.tripId, 0);
    orderByTripId.set(trip.tripId, i);
    heapPush(heap, {
      tripId: trip.tripId,
      due: Math.max(0, sales - initialPaid),
      order: i,
      version: 0,
    });
  }

  for (const rawAmount of amounts) {
    if (heap.length === 0) break;
    const amount = Number(rawAmount ?? 0);
    let best = heapPop(heap);

    while (best) {
      const sales = salesByTripId.get(best.tripId) ?? 0;
      const currentPaid = paidByTripId[best.tripId] ?? 0;
      const currentVersion = versionByTripId.get(best.tripId) ?? 0;
      const currentDue = Math.max(0, sales - currentPaid);
      if (best.version === currentVersion && best.due === currentDue) {
        break;
      }
      best = heapPop(heap);
    }

    if (!best) break;

    const tripId = best.tripId;
    const nextPaid = (paidByTripId[tripId] ?? 0) + amount;
    paidByTripId[tripId] = nextPaid;

    const nextVersion = (versionByTripId.get(tripId) ?? 0) + 1;
    versionByTripId.set(tripId, nextVersion);

    heapPush(heap, {
      tripId,
      due: Math.max(0, (salesByTripId.get(tripId) ?? 0) - nextPaid),
      order: orderByTripId.get(tripId) ?? 0,
      version: nextVersion,
    });
  }

  return paidByTripId;
}
