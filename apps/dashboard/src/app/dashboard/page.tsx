'use client';

import React, { useEffect, useState } from 'react';

interface DashboardStats {
  jobsDiscovered: number;
  uniqueOpenJobs: number;
  eligibleJobs: number;
  jobsScoringAbove7: number;
  applicationsSelected: number;
  documentsGenerated: number;
  applicationsQueued: number;
  applicationsWaitingForIntervention: number;
  applicationsReadyForReview: number;
  applicationsSubmitted: number;
  applicationsConfirmed: number;
  applicationsSkipped: number;
  applicationsFailed: number;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>({
    jobsDiscovered: 0,
    uniqueOpenJobs: 0,
    eligibleJobs: 0,
    jobsScoringAbove7: 0,
    applicationsSelected: 0,
    documentsGenerated: 0,
    applicationsQueued: 0,
    applicationsWaitingForIntervention: 0,
    applicationsReadyForReview: 0,
    applicationsSubmitted: 0,
    applicationsConfirmed: 0,
    applicationsSkipped: 0,
    applicationsFailed: 0,
  });

  useEffect(() => {
    const fetchStats = async () => {
      // TODO: Fetch stats from API endpoint
      // For now, use defaults
    };

    fetchStats();
  }, []);

  return (
    <div>
      <h1 className="text-4xl font-bold mb-8">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard
          title="Jobs Discovered"
          value={stats.jobsDiscovered}
          color="blue"
        />
        <StatCard
          title="Unique Open Jobs"
          value={stats.uniqueOpenJobs}
          color="green"
        />
        <StatCard
          title="Eligible Jobs"
          value={stats.eligibleJobs}
          color="purple"
        />
        <StatCard
          title="Scoring ≥7"
          value={stats.jobsScoringAbove7}
          color="amber"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div>
          <h2 className="text-2xl font-bold mb-4">Document Generation</h2>
          <div className="card">
            <table>
              <tbody>
                <tr>
                  <td>Applications Selected</td>
                  <td className="text-right font-bold">{stats.applicationsSelected}</td>
                </tr>
                <tr>
                  <td>Documents Generated</td>
                  <td className="text-right font-bold">{stats.documentsGenerated}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div>
          <h2 className="text-2xl font-bold mb-4">Application Status</h2>
          <div className="card">
            <table>
              <tbody>
                <tr>
                  <td>Queued</td>
                  <td className="text-right font-bold">{stats.applicationsQueued}</td>
                </tr>
                <tr>
                  <td>Waiting for Intervention</td>
                  <td className="text-right font-bold text-amber-600">
                    {stats.applicationsWaitingForIntervention}
                  </td>
                </tr>
                <tr>
                  <td>Ready for Review</td>
                  <td className="text-right font-bold text-blue-600">
                    {stats.applicationsReadyForReview}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="mt-8">
        <h2 className="text-2xl font-bold mb-4">Submission Results</h2>
        <div className="card">
          <table>
            <tbody>
              <tr>
                <td>Submitted</td>
                <td className="text-right font-bold text-green-600">
                  {stats.applicationsSubmitted}
                </td>
              </tr>
              <tr>
                <td>Confirmed</td>
                <td className="text-right font-bold text-green-600">
                  {stats.applicationsConfirmed}
                </td>
              </tr>
              <tr>
                <td>Skipped</td>
                <td className="text-right font-bold text-gray-600">
                  {stats.applicationsSkipped}
                </td>
              </tr>
              <tr>
                <td>Failed</td>
                <td className="text-right font-bold text-red-600">
                  {stats.applicationsFailed}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8 flex gap-4">
        <button className="button button-primary">Start Discovery Run</button>
        <button className="button button-secondary">View All Jobs</button>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  color,
}: {
  title: string;
  value: number;
  color: 'blue' | 'green' | 'purple' | 'amber';
}) {
  const colorClasses = {
    blue: 'bg-blue-50 text-blue-700',
    green: 'bg-green-50 text-green-700',
    purple: 'bg-purple-50 text-purple-700',
    amber: 'bg-amber-50 text-amber-700',
  };

  return (
    <div className={`card ${colorClasses[color]}`}>
      <div className="text-gray-600 text-sm font-medium">{title}</div>
      <div className="text-4xl font-bold mt-2">{value}</div>
    </div>
  );
}
