const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export async function fetchRepositories() {
  const res = await fetch(`${API_BASE}/api/v1/repositories`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch repositories');
  return res.json();
}

export async function fetchRepository(id: string) {
  const res = await fetch(`${API_BASE}/api/v1/repositories/${id}`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch repository');
  return res.json();
}

export async function registerRepository(url: string, defaultBranch = 'main') {
  const res = await fetch(`${API_BASE}/api/v1/repositories`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, defaultBranch }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error || 'Failed to register repository');
  }
  return res.json();
}

export async function fetchFileContent(repositoryId: string, filePath: string) {
  const res = await fetch(
    `${API_BASE}/api/v1/repositories/${repositoryId}/file?path=${encodeURIComponent(filePath)}`,
    { cache: 'no-store' }
  );
  if (!res.ok) throw new Error('Failed to fetch file content');
  return res.json();
}

export async function requestLiveKitToken(
  roomName: string,
  participantName = 'Developer',
  repositoryId?: string
) {
  const res = await fetch(`${API_BASE}/api/v1/livekit/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomName, participantName, repositoryId }),
  });
  if (!res.ok) throw new Error('Failed to fetch LiveKit token');
  return res.json();
}
