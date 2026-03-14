import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async () => {
	const token = env.CLICKUP_API_TOKEN;
	const teamId = env.CLICKUP_TEAM_ID;
	if (!token || !teamId) return json({ ok: false, spaces: [] });

	try {
		const res = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space?archived=false`, {
			headers: { Authorization: token }
		});
		if (!res.ok) return json({ ok: false, spaces: [] });
		const data = await res.json();
		const spaces = data.spaces.map((s: any) => ({ id: s.id, name: s.name }));
		return json({ ok: true, spaces });
	} catch {
		return json({ ok: false, spaces: [] });
	}
};
