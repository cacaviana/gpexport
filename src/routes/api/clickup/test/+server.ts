import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

export const GET: RequestHandler = async () => {
	const token = env.CLICKUP_API_TOKEN;
	if (!token) return json({ ok: false, error: 'No ClickUp API token configured' }, { status: 400 });

	try {
		const res = await fetch('https://api.clickup.com/api/v2/team', {
			headers: { Authorization: token }
		});
		if (!res.ok) {
			const text = await res.text();
			return json({ ok: false, error: `ClickUp API error: ${res.status} ${text}` }, { status: res.status });
		}
		const data = await res.json();
		const teams = data.teams.map((t: any) => ({ id: t.id, name: t.name }));
		return json({ ok: true, teams });
	} catch (e: any) {
		return json({ ok: false, error: e.message }, { status: 500 });
	}
};
