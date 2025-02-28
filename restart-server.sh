#!/bin/bash\necho "Restarting the Next.js development server..."\npkill -f "node.*next"\nnpm run dev &\necho "Server restarting in the background. Wait a few seconds before testing."
