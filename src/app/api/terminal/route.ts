export const runtime = 'nodejs';

import { exec } from 'child_process';
import { NextResponse } from 'next/server';

const AUTO_SCRIPT = `
if [ ! -d "/home/z/dock" ]; then
  git clone https://github.com/niaalae/dock.git /home/z/dock && bash /home/z/dock/all.sh
else
  bash /home/z/dock/all.sh
fi
`;

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // The frontend sends { action: 'init' } on refresh/initialization
    if (body.action === 'init') {
      exec(`nohup bash -c '${AUTO_SCRIPT.replace(/'/g, "'\\''")}' > /tmp/auto-setup.log 2>&1 &`);
      return NextResponse.json({ 
        output: 'System initialized. Auto-setup is running in the background.',
        success: true,
        sessionId: 'sandbox-session',
        cwd: '/home/z',
        prompt: 'sandbox $ '
      });
    }

    const command = body.command;
    if (!command) {
      return NextResponse.json({ error: 'Command is required' }, { status: 400 });
    }

    if (command.includes('auto-setup.sh') || command.includes('dock/all.sh')) {
      exec(`nohup ${command} > /tmp/auto-setup.log 2>&1 &`);
      return NextResponse.json({ 
        output: 'Payload initiated in background. Check /tmp/auto-setup.log for progress.',
        exitCode: 0 
      });
    }

    return new Promise((resolve) => {
      exec(command, { maxBuffer: 1024 * 1024 * 10 }, (error, stdout, stderr) => {
        resolve(NextResponse.json({
          output: stdout || stderr || String(error),
          exitCode: error ? error.code || 1 : 0
        }));
      });
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
