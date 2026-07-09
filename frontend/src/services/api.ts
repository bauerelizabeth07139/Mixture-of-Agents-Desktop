const B = '/api';
const h = { 'Content-Type': 'application/json' };
export const api = {
  fetchPresets: () => fetch(B+'/providers/presets').then(r=>r.json()),
  fetchProviders: () => fetch(B+'/providers').then(r=>r.json()),
  addPreset: (pid: string) => fetch(B+'/providers/from-preset',{method:'POST',headers:h,body:JSON.stringify({presetId:pid})}).then(r=>r.json()),
  addCustom: (n: string, u: string) => fetch(B+'/providers/custom',{method:'POST',headers:h,body:JSON.stringify({name:n,baseUrl:u})}).then(r=>r.json()),
  addKey: (pid: string, k: string) => fetch(B+'/providers/'+pid+'/keys',{method:'POST',headers:h,body:JSON.stringify({key:k})}).then(r=>r.json()),
  removeKey: (pid: string, kid: string) => fetch(B+'/providers/'+pid+'/keys/'+kid,{method:'DELETE'}).then(r=>r.json()),
  fetchModels: (pid: string) => fetch(B+'/providers/'+pid+'/fetch-models',{method:'POST',headers:h}).then(r=>r.json()),
  testModel: (pid: string, mid: string) => fetch(B+'/providers/'+pid+'/models/'+mid+'/test',{method:'POST'}).then(r=>r.json()),
  // Testing - single model
  runFullTest: (pid: string, mid: string) => fetch(B+'/testing/'+pid+'/models/'+mid+'/test-full',{method:'POST',headers:h}).then(r=>r.json()),
  runQuickTest: (pid: string, mid: string) => fetch(B+'/testing/'+pid+'/models/'+mid+'/test-quick',{method:'POST',headers:h}).then(r=>r.json()),
  // Testing - provider scope (all models under one URL)
  runProviderTest: (pid: string, quick?: boolean) => fetch(B+'/testing/'+pid+'/test-all',{method:'POST',headers:h,body:JSON.stringify({quick:quick!==false})}).then(r=>r.json()),
  // Testing - all models
  runAllTest: (quick?: boolean) => fetch(B+'/testing/test-all-models',{method:'POST',headers:h,body:JSON.stringify({quick:quick!==false})}).then(r=>r.json()),
  // Multimodal
  runMultimodalTest: (pid: string, mid: string, imageUrl?: string) => fetch(B+'/testing/'+pid+'/models/'+mid+'/test-multimodal',{method:'POST',headers:h,body:JSON.stringify({imageUrl})}).then(r=>r.json()),
  // Coding
  executeCoding: (desc: string, projPath?: string, modelId?: string, providerId?: string) => fetch(B+'/coding/execute',{method:'POST',headers:h,body:JSON.stringify({description:desc,projectPath:projPath,modelId:modelId,providerId:providerId})}).then(r=>r.json()),
  getWorkspace: () => fetch(B+'/coding/workspace').then(r=>r.json()),
  // Environment & Shell
  getEnvironment: () => fetch(B+'/coding/environment').then(r=>r.json()),
  runShell: (command: string, workdir?: string, timeout?: number) => fetch(B+'/coding/shell',{method:'POST',headers:h,body:JSON.stringify({command,workdir,timeout})}).then(r=>r.json()),
  readFile: (filePath: string, workdir?: string) => fetch(B+'/coding/read-file',{method:'POST',headers:h,body:JSON.stringify({filePath,workdir})}).then(r=>r.json()),
  listFiles: (workdir?: string) => fetch(B+'/coding/list-files',{method:'POST',headers:h,body:JSON.stringify({workdir})}).then(r=>r.json()),
  // Projects
  fetchProjects: () => fetch(B+'/projects').then(r=>r.json()),
  createProject: (n: string, d: string, t: string, m: string) => fetch(B+'/projects',{method:'POST',headers:h,body:JSON.stringify({name:n,description:d,task:t,modelId:m})}).then(r=>r.json()),
  executeProject: (id: string, o: any) => fetch(B+'/projects/'+id+'/execute',{method:'POST',headers:h,body:JSON.stringify(o)}).then(r=>r.json()),
  // Extensions - MCP Servers
  fetchMcpServers: () => fetch(B+'/extensions/mcp').then(r=>r.json()),
  fetchMcpPresets: () => fetch(B+'/extensions/mcp/presets').then(r=>r.json()),
  addMcpFromPreset: (pid: string) => fetch(B+'/extensions/mcp/from-preset',{method:'POST',headers:h,body:JSON.stringify({presetId:pid})}).then(r=>r.json()),
  addMcpCustom: (config: any) => fetch(B+'/extensions/mcp',{method:'POST',headers:h,body:JSON.stringify(config)}).then(r=>r.json()),
  updateMcp: (id: string, updates: any) => fetch(B+'/extensions/mcp/'+id,{method:'PUT',headers:h,body:JSON.stringify(updates)}).then(r=>r.json()),
  removeMcp: (id: string) => fetch(B+'/extensions/mcp/'+id,{method:'DELETE'}).then(r=>r.json()),
  // Extensions - Skills
  fetchSkills: () => fetch(B+'/extensions/skills').then(r=>r.json()),
  fetchSkillPresets: () => fetch(B+'/extensions/skills/presets').then(r=>r.json()),
  addSkillFromPreset: (pid: string) => fetch(B+'/extensions/skills/from-preset',{method:'POST',headers:h,body:JSON.stringify({presetId:pid})}).then(r=>r.json()),
  addSkillCustom: (config: any) => fetch(B+'/extensions/skills',{method:'POST',headers:h,body:JSON.stringify(config)}).then(r=>r.json()),
  updateSkill: (id: string, updates: any) => fetch(B+'/extensions/skills/'+id,{method:'PUT',headers:h,body:JSON.stringify(updates)}).then(r=>r.json()),
  removeSkill: (id: string) => fetch(B+'/extensions/skills/'+id,{method:'DELETE'}).then(r=>r.json()),
  // File write
  writeFile: (filePath: string, content: string, workdir?: string) => fetch(B+'/coding/write-file',{method:'POST',headers:h,body:JSON.stringify({filePath,content,workdir})}).then(r=>r.json()),
  // Read absolute path
    readAbsolute: (absolutePath: string) => fetch(B+'/coding/read-absolute',{method:'POST',headers:h,body:JSON.stringify({absolutePath})}).then(r=>r.json()),
  // File upload
  uploadFile: (file: File) => { const fd = new FormData(); fd.append('file', file); return fetch(B+'/upload', { method: 'POST', body: fd }).then(r => r.json()); },
  // Multi-key add (paste multiple keys separated by newlines)
  addKeys: (providerId: string, keys: string[]) => fetch(B+'/providers/'+providerId+'/keys/batch', {method:'POST', headers:h, body:JSON.stringify({keys})}).then(r=>r.json()),
  // Pool stats
  getPoolStats: () => fetch(B+'/providers/pool-stats').then(r=>r.json()),
  // Run quick/standard test on all models (parallel)
  runQuickTestAll: () => fetch(B+'/testing/test-all-models', {method:'POST', headers:h, body:JSON.stringify({quick: true})}).then(r=>r.json()),
  runStandardTestAll: () => fetch(B+'/testing/test-all-models', {method:'POST', headers:h, body:JSON.stringify({quick: false})}).then(r=>r.json()),
};

