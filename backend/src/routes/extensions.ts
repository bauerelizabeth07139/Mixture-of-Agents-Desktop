import { Router } from 'express';
import { ExtensionManager } from '../services/extensions/extension-manager';

export function createExtensionRoutes(extManager: ExtensionManager) {
  const r = Router();

  // ============ MCP Servers ============
  r.get('/mcp', (_req, res) => {
    res.json(extManager.getAllMcpServers());
  });

  r.get('/mcp/presets', (_req, res) => {
    res.json(extManager.getMcpPresets());
  });

  r.post('/mcp/from-preset', (req, res) => {
    const { presetId, overrides } = req.body;
    if (!presetId) return res.status(400).json({ error: 'Missing presetId' });
    const server = extManager.addMcpFromPreset(presetId, overrides);
    if (!server) return res.status(404).json({ error: 'Preset not found' });
    res.json(server);
  });

  r.post('/mcp', (req, res) => {
    const config = req.body;
    if (!config.name) return res.status(400).json({ error: 'Missing name' });
    const server = extManager.addMcpServer(config);
    res.json(server);
  });

  r.put('/mcp/:id', (req, res) => {
    const updated = extManager.updateMcpServer(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  });

  r.delete('/mcp/:id', (req, res) => {
    const ok = extManager.removeMcpServer(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  });

  // ============ Skills ============
  r.get('/skills', (_req, res) => {
    res.json(extManager.getAllSkills());
  });

  r.get('/skills/presets', (_req, res) => {
    res.json(extManager.getSkillPresets());
  });

  r.post('/skills/from-preset', (req, res) => {
    const { presetId, overrides } = req.body;
    if (!presetId) return res.status(400).json({ error: 'Missing presetId' });
    const skill = extManager.addSkillFromPreset(presetId, overrides);
    if (!skill) return res.status(404).json({ error: 'Preset not found' });
    res.json(skill);
  });

  r.post('/skills', (req, res) => {
    const config = req.body;
    if (!config.name) return res.status(400).json({ error: 'Missing name' });
    const skill = extManager.addSkill(config);
    res.json(skill);
  });

  r.put('/skills/:id', (req, res) => {
    const updated = extManager.updateSkill(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Not found' });
    res.json(updated);
  });

  r.delete('/skills/:id', (req, res) => {
    const ok = extManager.removeSkill(req.params.id);
    if (!ok) return res.status(404).json({ error: 'Not found' });
    res.json({ success: true });
  });

  return r;
}
