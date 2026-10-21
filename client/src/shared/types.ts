export type AlertSeverityType = 'critical' | 'warning' | 'info' | 'positive';

export type AlertType = {
  key: string;
  type: string;
  severity: AlertSeverityType;
  personId: number;
  title: string;
  detail: string | null;
};

export type CadenceStateType = {
  lastDoneAt: string | null;
  daysSinceLast: number | null;
  effectiveDaysSinceLast: number | null;
  dueAt: string | null;
  overdueDays: number;
  isOverdue: boolean;
  isAbsentToday: boolean;
  neverMet: boolean;
  tenureDays: number | null;
};

export type PersonAlertGroupType = {
  personId: number;
  personName: string;
  worstSeverity: AlertSeverityType;
  alerts: AlertType[];
  cadence: CadenceStateType;
  cadenceDays: number;
  photoPath: string | null;
};

export type UpcomingMeetingType = {
  oneOnOneId: number;
  personId: number;
  personName: string;
  plannedAt: string;
  daysUntil: number;
};

export type OverdueCommitmentType = {
  id: number;
  personId: number;
  personName: string;
  direction: 'i_owe' | 'they_owe';
  title: string;
  dueAt: string;
  overdueDays: number;
};

export type KarmaFeedItemType = {
  id: number;
  personId: number;
  personName: string;
  category: string;
  description: string;
  happenedAt: string;
};

export type GoodNewsType = {
  key: string;
  personId: number;
  personName: string;
  title: string;
  detail: string | null;
};

export type QuietPersonType = {
  id: number;
  fullName: string;
  photoPath: string | null;
  cadence: CadenceStateType;
};

export type DashboardType = {
  today: string;
  groups: PersonAlertGroupType[];
  groupsHidden: number;
  goodNews: GoodNewsType[];
  upcoming: UpcomingMeetingType[];
  overdueCommitments: OverdueCommitmentType[];
  karmaFeed: KarmaFeedItemType[];
  peopleCount: number;
  quietPeople: QuietPersonType[];
};

export type PersonType = {
  id: number;
  fullName: string;
  kind: 'member' | 'peer';
  externalRole: string | null;
  specializationId: number | null;
  gradeId: number | null;
  photoPath: string | null;
  hiredAt: string | null;
  probationEndsAt: string | null;
  birthday: string | null;
  cadenceDays: number;
  status: 'active' | 'archived';
  leftAt: string | null;
  archiveReason: string | null;
  specializationName: string | null;
  departmentId: number | null;
  departmentName: string | null;
  departmentColor: string | null;
  gradeName: string | null;
  gradeLevel: number | null;
};

export type CommitmentType = {
  id: number;
  personId: number;
  oneOnOneId: number | null;
  direction: 'i_owe' | 'they_owe';
  title: string;
  details: string | null;
  dueAt: string | null;
  status: 'open' | 'done' | 'cancelled' | 'snoozed';
  completedAt: string | null;
  snoozedUntil: string | null;
  createdAt: string;
};

export type OneOnOneType = {
  id: number;
  personId: number;
  plannedAt: string | null;
  happenedAt: string | null;
  status: 'planned' | 'done' | 'skipped';
  agenda: string | null;
  notes: string | null;
  durationMinutes: number | null;
  isSensitive: boolean;
};

export type CheckinType = {
  id: number;
  personId: number;
  measuredAt: string;
  motivation: number;
  workloadPressure: number;
  satisfaction: number;
  note: string | null;
};

export type KarmaEntryType = {
  id: number;
  personId: number;
  category: string;
  description: string;
  happenedAt: string;
};

export type PersonContextType = {
  person: PersonType;
  cadence: CadenceStateType;
  lastMeeting: OneOnOneType | null;
  nextPlanned: OneOnOneType | null;
  openCommitments: { iOwe: CommitmentType[]; theyOwe: CommitmentType[] };
  recentCheckins: CheckinType[];
  lastCheckin: CheckinType | null;
  karmaSinceLastMeeting: KarmaEntryType[];
  karmaSummary: KarmaSummaryType;
  noteBlocks: NoteBlockType[];
  suggestedNextAt: string;
  skippedStreak: number;
  suggestedAgenda: { text: string; isSensitive: boolean }[];
};

export type ReferenceType = {
  departments: { id: number; name: string; color: string }[];
  specializations: { id: number; name: string; departmentId: number }[];
  grades: { id: number; name: string; level: number }[];
};

export type PersonTimelineType = {
  oneOnOnes: OneOnOneType[];
  commitments: CommitmentType[];
  checkins: CheckinType[];
  karma: KarmaEntryType[];
  events: {
    id: number;
    kind: string;
    at: string;
    fromValue: string | null;
    toValue: string | null;
    note: string | null;
  }[];
  absences: AbsenceType[];
};

export type KarmaSummaryType = {
  inWindow: number;
  total: number;
  windowDays: number;
  byCategory: { category: string; count: number }[];
  lastAt: string | null;
  daysSinceLast: number | null;
};

export type KarmaRecordType = {
  id: number;
  personId: number;
  personName: string;
  category: string;
  description: string;
  happenedAt: string;
};

export type TeamKarmaType = {
  today: string;
  windowDays: number;
  rows: {
    personId: number;
    personName: string;
    summary: KarmaSummaryType;
  }[];
  records: KarmaRecordType[];
  categories: string[];
  givenInWindow: number;
  peopleTouched: number;
  neverMarked: { personId: number; personName: string }[];
};

export type ScoredAttributeType = {
  attributeId: number;
  key: string;
  name: string;
  shortCode: string;
  kind: 'core' | 'skill';
  axis: 'skill' | 'will' | 'neutral';
  description: string | null;
  value: number | null;
  confidence: 'sure' | 'assuming' | null;
  assessedAt: string | null;
  evidence: string | null;
  reliability: { score: number; ageDays: number | null; isStale: boolean };
  expected: number | null;
};

export type StructureUsageType = {
  people: number;
  attributes: number;
  assessments: number;
  specializations: number;
};

export type DepartmentSettingType = {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
  isActive: boolean;
  usage: StructureUsageType;
};

export type SpecializationSettingType = {
  id: number;
  name: string;
  departmentId: number;
  sortOrder: number;
  isActive: boolean;
  usage: StructureUsageType;
};

export type ReferenceFullType = {
  departments: DepartmentSettingType[];
  specializations: SpecializationSettingType[];
  grades: { id: number; name: string; level: number }[];
};

export type AttributeSettingType = {
  id: number;
  key: string;
  name: string;
  shortCode: string;
  kind: 'core' | 'skill';
  specializationId: number | null;
  axis: 'skill' | 'will' | 'neutral';
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  usage: { attributeId: number; assessments: number; people: number };
};

export type GradeExpectationType = {
  id: number;
  gradeId: number;
  attributeId: number;
  expectedValue: number;
};

export type GradeGapType = {
  attributeId: number;
  name: string;
  shortCode: string;
  expected: number;
  actual: number | null;
  gap: number;
};

export type CardTierType = 'bronze' | 'silver' | 'gold' | 'special';

export type PersonCardType = {
  personId: number;
  fullName: string;
  photoPath: string | null;
  gradeName: string | null;
  gradeLevel: number | null;
  specializationName: string | null;
  departmentName: string | null;
  tier: CardTierType;
  ovr: { value: number | null; assessed: number; total: number };
  core: ScoredAttributeType[];
  skills: ScoredAttributeType[];
  pastExperience: ScoredAttributeType[];
  gradeMatch: number | null;
  nextGrade: { name: string; match: number | null; gaps: GradeGapType[] } | null;
  currentGaps: GradeGapType[];
  /** true — оценки скрыты режимом показа, а не отсутствуют. */
  assessmentsHidden?: boolean;
};

export type AssessmentType = {
  id: number;
  personId: number;
  attributeId: number;
  value: number;
  confidence: 'sure' | 'assuming';
  evidence: string | null;
  assessedAt: string;
};

export type NoteBlockKindType =
  | 'career_goal'
  | 'motivators'
  | 'demotivators'
  | 'flight_risk'
  | 'i_owe_long_term';

export type NoteBlockSpecType = {
  kind: NoteBlockKindType;
  title: string;
  placeholder: string;
  reviewAfterDays: number;
  options?: string[];
  isSensitiveByDefault: boolean;
};

export type NoteBlockType = {
  id: number;
  personId: number;
  kind: NoteBlockKindType;
  content: string | null;
  value: string | null;
  reviewAt: string | null;
  confirmedAt: string | null;
  isSensitive: boolean;
  staleness: { isDue: boolean; daysOverdue: number; ageDays: number | null };
};

export type AbsenceType = {
  id: number;
  personId: number;
  fromDay: string;
  toDay: string;
  kind: 'отпуск' | 'больничный' | 'другое' | string;
  note: string | null;
};

export type CalendarAbsenceType = {
  id: number;
  personId: number;
  fromDay: string;
  toDay: string;
  kind: string;
};

export type CalendarPersonType = {
  personId: number;
  fullName: string;
  photoPath: string | null;
  absences: CalendarAbsenceType[];
  daysAway: number;
};

export type CoverageGapType = {
  fromDay: string;
  toDay: string;
  awayCount: number;
  total: number;
};

export type CalendarGroupType = {
  label: string;
  specializationName: string | null;
  people: CalendarPersonType[];
  gaps: CoverageGapType[];
};

export type CalendarDepartmentType = {
  name: string;
  color: string;
  groups: CalendarGroupType[];
};

export type AbsenceCalendarType = {
  from: string;
  to: string;
  totalDays: number;
  months: { label: string; startDay: string; days: number }[];
  weekStarts: string[];
  departments: CalendarDepartmentType[];
};

export type TeamAxisSummaryType = {
  key: string;
  label: string;
  average: number | null;
  previousAverage: number | null;
  higherIsBetter: boolean;
  distribution: number[];
  worstValue: number | null;
  worstCount: number;
};

export type TeamClimateType = {
  measuredPeople: number;
  totalPeople: number;
  axes: TeamAxisSummaryType[];
};

export type KarmaCategoryType = {
  id: number;
  name: string;
  sortOrder: number;
  isActive: boolean;
};

export type TeamType = {
  id: number;
  name: string;
  color: string;
  sortOrder: number;
  usage: { people: number };
};

export type TeamsResponseType = { teams: TeamType[]; activeId: number };

/* -------------------------------- косяки -------------------------------- */

export type IssueType = {
  id: number;
  personId: number;
  description: string;
  happenedAt: string;
  discussedAt: string | null;
  oneOnOneId: number | null;
};

export type IssueViewType = IssueType & {
  ageDays: number;
  isDiscussed: boolean;
  isOverdue: boolean;
};

export type IssueSummaryType = {
  open: IssueViewType[];
  recent: IssueViewType[];
  olderCount: number;
  total: number;
};

export type TodoType = {
  id: number;
  title: string;
  dueAt: string | null;
  position: number;
  completedAt: string | null;
  createdAt: string;
};

export type MyCommitmentType = {
  id: number;
  personId: number;
  personName: string;
  title: string;
  dueAt: string | null;
};
