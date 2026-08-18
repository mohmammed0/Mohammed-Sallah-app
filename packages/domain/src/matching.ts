export interface MatchingWeights {
  distance: number;
  availability: number;
  rating: number;
  response: number;
  workload: number;
  completedJobs: number;
}

export interface MatchingCandidate {
  providerId: string;
  verified: boolean;
  suspended: boolean;
  supportsCategory: boolean;
  supportsRestrictedService: boolean;
  restrictedService: boolean;
  available: boolean;
  insideServiceArea: boolean;
  blocked: boolean;
  distanceScore: number;
  ratingScore: number;
  responseScore: number;
  workloadScore: number;
  completedJobsScore: number;
}

export type MatchingResult =
  | { eligible: false; providerId: string; exclusionReason: string }
  | {
      eligible: true;
      providerId: string;
      score: number;
      components: Record<keyof MatchingWeights, number>;
    };

export const defaultMatchingWeights: MatchingWeights = {
  distance: 0.25,
  availability: 0.15,
  rating: 0.2,
  response: 0.15,
  workload: 0.15,
  completedJobs: 0.1,
};

export function scoreCandidate(
  candidate: MatchingCandidate,
  weights = defaultMatchingWeights,
): MatchingResult {
  const exclusions: Array<[boolean, string]> = [
    [!candidate.verified, 'provider_not_verified'],
    [candidate.suspended, 'provider_suspended'],
    [!candidate.supportsCategory, 'category_not_supported'],
    [!candidate.available, 'provider_unavailable'],
    [!candidate.insideServiceArea, 'outside_service_area'],
    [candidate.blocked, 'blocked_relationship'],
    [
      candidate.restrictedService && !candidate.supportsRestrictedService,
      'restricted_requirement_missing',
    ],
  ];
  const excluded = exclusions.find(([condition]) => condition);
  if (excluded)
    return { eligible: false, providerId: candidate.providerId, exclusionReason: excluded[1] };
  const components = {
    distance: candidate.distanceScore * weights.distance,
    availability: weights.availability,
    rating: candidate.ratingScore * weights.rating,
    response: candidate.responseScore * weights.response,
    workload: candidate.workloadScore * weights.workload,
    completedJobs: candidate.completedJobsScore * weights.completedJobs,
  };
  const score = Object.values(components).reduce((total, value) => total + value, 0);
  return {
    eligible: true,
    providerId: candidate.providerId,
    score: Math.round(score * 10000) / 10000,
    components,
  };
}
