import fs from 'fs';
import path from 'path';

export async function chmodRecursive(
    dirPath: string,
    dirPermissions = 0o755,  // rwxr-xr-x for directories
    filePermissions = 0o644  // rw-r--r-- for files
) {
    try {
        const stats = await fs.promises.stat(dirPath);

        if (stats.isDirectory()) {
            await fs.promises.chmod(dirPath, dirPermissions);

            // Process directory contents
            const items = await fs.promises.readdir(dirPath);
            for (const item of items) {
                const itemPath = path.join(dirPath, item);
                await chmodRecursive(itemPath, dirPermissions, filePermissions);
            }
        } else {
            await fs.promises.chmod(dirPath, filePermissions);
        }
    } catch (error) {
        console.error(`Error setting permissions on ${dirPath}:`, error.message);
    }
}


export async function chownRecursive(targetPath: string, uid: number, gid: number) {
    try {
        const stats = await fs.promises.stat(targetPath);

        await fs.promises.chown(targetPath, uid, gid);
        
        if (stats.isDirectory()) {
            const items = await fs.promises.readdir(targetPath);
            for (const item of items) {
                await chownRecursive(path.join(targetPath, item), uid, gid);
            }
        }
    } catch (error) {
        console.error(`Error changing ownership on ${targetPath}:`, error.message);
    }
}