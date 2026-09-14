export type EventKind = "flight" | "hotel" | "meal" | "activity" | "transfer" | "other";
export type EventStatus = "active" | "canceled";

export type Trip = {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  place: string;
};

export type Day = {
  id: string;
  tripId: string;
  date: string;
};

export type Event = {
  id: string;
  tripId: string;
  dayId: string;
  title: string;
  kind: EventKind;
  start: string;
  end: string;
  status: EventStatus;
  notes?: string;
  conflict?: boolean;
};

export type EventWithConflicts = Event & { conflict: boolean };
