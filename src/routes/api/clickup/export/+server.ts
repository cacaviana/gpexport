import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';

const CLICKUP_BASE = 'https://api.clickup.com/api/v2';

async function clickupFetch(path: string, method: string = 'GET', body?: any) {
	const token = env.CLICKUP_API_TOKEN;
	const res = await fetch(`${CLICKUP_BASE}${path}`, {
		method,
		headers: {
			Authorization: token!,
			'Content-Type': 'application/json'
		},
		body: body ? JSON.stringify(body) : undefined
	});
	if (!res.ok) {
		const text = await res.text();
		throw new Error(`ClickUp ${method} ${path}: ${res.status} ${text}`);
	}
	return res.json();
}

const STATUS_MAP: Record<string, string> = {
	todo: 'to do',
	in_progress: 'in progress',
	done: 'complete',
	blocked: 'blocked',
	review: 'in review'
};

export const POST: RequestHandler = async ({ request }) => {
	const token = env.CLICKUP_API_TOKEN;
	const teamId = env.CLICKUP_TEAM_ID;
	if (!token) return json({ ok: false, error: 'No ClickUp API token' }, { status: 400 });
	if (!teamId) return json({ ok: false, error: 'No Team ID configured' }, { status: 400 });

	const { data } = await request.json();
	if (!data?.projectName || !data?.levels) {
		return json({ ok: false, error: 'Invalid data structure' }, { status: 400 });
	}

	const log: string[] = [];
	try {
		// 1. Create Space
		const space = await clickupFetch(`/team/${teamId}/space`, 'POST', {
			name: data.projectName,
			multiple_assignees: true,
			features: {
				due_dates: { enabled: true, start_date: false, remap_due_dates: false, remap_closed_due_date: false },
				checklists: { enabled: true }
			}
		});
		log.push(`✅ Space "${data.projectName}" criado (id: ${space.id})`);

		// 2. For each level: create Folder
		for (const level of data.levels) {
			const folder = await clickupFetch(`/space/${space.id}/folder`, 'POST', {
				name: level.name
			});
			log.push(`✅ Folder "${level.name}" criado`);

			// 3. For each domain: create List
			for (const domain of level.domains) {
				const list = await clickupFetch(`/folder/${folder.id}/list`, 'POST', {
					name: `${domain.name} (${domain.totalFeatures || domain.devFeatures.length} tasks)`
				});
				log.push(`  📋 List "${domain.name}" criado`);

				// 4. For each dev feature: create Task
				for (const feature of domain.devFeatures) {
					const taskBody: any = {
						name: feature.name,
						description: feature.description || '',
						status: STATUS_MAP[feature.statusBack] || 'to do'
					};

					if (feature.dependsOn && feature.dependsOn.length > 0) {
						taskBody.description += `\n\nDepende de: ${feature.dependsOn.join(', ')}`;
					}

					const task = await clickupFetch(`/list/${list.id}/task`, 'POST', taskBody);

					// 5. Create checklist with Back/Front/QA
					const checklist = await clickupFetch(`/task/${task.id}/checklist`, 'POST', {
						name: 'Camadas'
					});

					const layers = [
						{ name: 'Back', status: feature.statusBack },
						{ name: 'Front', status: feature.statusFront },
						{ name: 'QA', status: feature.statusQA }
					];
					for (const layer of layers) {
						await clickupFetch(`/checklist/${checklist.checklist.id}/checklist_item`, 'POST', {
							name: `${layer.name}`,
							resolved: layer.status === 'done'
						});
					}

					const statusEmoji = feature.statusBack === 'done' ? '✅' : feature.statusBack === 'blocked' ? '🔴' : '⬜';
					log.push(`    ${statusEmoji} Task "${feature.name}"`);
				}
			}
		}

		return json({ ok: true, log });
	} catch (e: any) {
		log.push(`❌ Erro: ${e.message}`);
		return json({ ok: false, error: e.message, log }, { status: 500 });
	}
};
