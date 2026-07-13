import { z } from 'zod';

export const SearchConfigSchema = z.object({
  titles: z.array(z.string()).min(1),
  locations: z.array(z.string()).min(1),
  remoteAllowed: z.boolean().default(true),
  employmentTypes: z.array(z.string()).default(['full-time']),
  postedWithinDays: z.number().int().positive().default(7),
  maximumResultsPerSearch: z.number().int().positive().default(100),
});

export const SearchesConfigSchema = z.object({
  searches: z.array(SearchConfigSchema).min(1),
});

export const ActorConfigSchema = z.object({
  actorId: z.string(),
  enabled: z.boolean().default(true),
  inputMapping: z.record(z.string()).optional(),
});

export const ActorsConfigSchema = z.object({
  linkedin: ActorConfigSchema.optional(),
  indeed: ActorConfigSchema.optional(),
});

export const ScoringRubricSchema = z.object({
  coreResponsibilityWeight: z.number().min(0).max(1).default(0.3),
  requiredSkillsWeight: z.number().min(0).max(1).default(0.2),
  productDomainWeight: z.number().min(0).max(1).default(0.15),
  seniorityAlignWeight: z.number().min(0).max(1).default(0.15),
  technicalBackgroundWeight: z.number().min(0).max(1).default(0.1),
  educationWeight: z.number().min(0).max(1).default(0.05),
  locationWorkWeight: z.number().min(0).max(1).default(0.05),
});

export const ScoringConfigSchema = z.object({
  experienceWeightPercentage: z.number().min(0).max(100).default(70),
  viabilityWeightPercentage: z.number().min(0).max(100).default(30),
  rubric: ScoringRubricSchema.optional(),
});

export const ApplicationPolicySchema = z.object({
  submissionMode: z.enum(['manual', 'reviewed-auto', 'automatic']).default('manual'),
  minimumScore: z.number().min(0).max(10).default(7.0),
  maximumApplications: z.number().int().positive().default(100),
  oneApplicationPerCompany: z.boolean().default(true),
  requireAll: z.object({
    eligibilityPassed: z.boolean().default(true),
    validationPassed: z.boolean().default(true),
    noUnknownAnswers: z.boolean().default(true),
    noPendingChallenge: z.boolean().default(true),
    duplicateCheckPassed: z.boolean().default(true),
    correctDocumentsAttached: z.boolean().default(true),
    sponsorshipAnswerVerified: z.boolean().default(true),
  }).optional(),
  manualReviewWhen: z.array(z.string()).optional(),
});

export const AnswerPolicySchema = z.object({
  lockedAnswers: z.record(z.any()).optional(),
  approvedAnswers: z.record(z.any()).optional(),
  manualReviewQuestions: z.array(z.string()).optional(),
});

export const CandidateProfileSchema = z.object({
  legalName: z.string(),
  email: z.string().email(),
  phone: z.string(),
  location: z.string(),
  timezone: z.string().default('America/Chicago'),
  workAuthorization: z.string(),
  sponsorshipRequired: z.boolean(),
  targetRoles: z.array(z.string()),
  targetLocations: z.array(z.string()).optional(),
  excludedCompanies: z.array(z.string()).optional(),
  excludedKeywords: z.array(z.string()).optional(),
  seniorityRange: z.object({
    min: z.string(),
    max: z.string(),
  }).optional(),
  maxExperienceYears: z.number().optional(),
  portfolioLinks: z.array(z.string().url()).optional(),
});

export const ExperienceEntrySchema = z.object({
  id: z.string(),
  employer: z.string(),
  title: z.string(),
  startDate: z.string(),
  endDate: z.string().optional(),
  current: z.boolean().default(false),
  description: z.string(),
  responsibilities: z.array(z.string()),
  skills: z.array(z.string()),
  metrics: z.array(z.object({
    description: z.string(),
    value: z.string(),
  })).optional(),
  projects: z.array(z.object({
    name: z.string(),
    description: z.string(),
    impact: z.string().optional(),
  })).optional(),
  verified: z.boolean().default(true),
});

export const EducationEntrySchema = z.object({
  id: z.string(),
  school: z.string(),
  degree: z.string(),
  field: z.string(),
  graduationDate: z.string(),
  gpa: z.number().optional(),
  honors: z.array(z.string()).optional(),
  relevant: z.array(z.string()).optional(),
  verified: z.boolean().default(true),
});

export const ExperienceInventorySchema = z.object({
  experiences: z.array(ExperienceEntrySchema),
  education: z.array(EducationEntrySchema),
  skills: z.array(z.string()),
  certifications: z.array(z.object({
    name: z.string(),
    issuer: z.string(),
    date: z.string(),
  })).optional(),
  publications: z.array(z.object({
    title: z.string(),
    url: z.string(),
  })).optional(),
});

export type SearchConfig = z.infer<typeof SearchConfigSchema>;
export type SearchesConfig = z.infer<typeof SearchesConfigSchema>;
export type ActorConfig = z.infer<typeof ActorConfigSchema>;
export type ActorsConfig = z.infer<typeof ActorsConfigSchema>;
export type ScoringRubric = z.infer<typeof ScoringRubricSchema>;
export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;
export type ApplicationPolicy = z.infer<typeof ApplicationPolicySchema>;
export type AnswerPolicy = z.infer<typeof AnswerPolicySchema>;
export type CandidateProfile = z.infer<typeof CandidateProfileSchema>;
export type ExperienceEntry = z.infer<typeof ExperienceEntrySchema>;
export type EducationEntry = z.infer<typeof EducationEntrySchema>;
export type ExperienceInventory = z.infer<typeof ExperienceInventorySchema>;
