using System.Runtime.InteropServices;

namespace BorisType.FileSystem;

// File.Move may implement cross-volume moves by copy/delete. Use native rename
// operations that fail instead, and request no-replace at the syscall boundary.
internal static class FileMove
{
    [DllImport("libc", EntryPoint = "renameat2", SetLastError = true)]
    private static extern int RenameAt2(int oldDirectory, [MarshalAs(UnmanagedType.LPUTF8Str)] string oldPath,
        int newDirectory, [MarshalAs(UnmanagedType.LPUTF8Str)] string newPath, uint flags);

    [DllImport("kernel32.dll", EntryPoint = "MoveFileExW", CharSet = CharSet.Unicode, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool MoveFileEx(string source, string destination, uint flags);

    internal static void Rename(string source, string destination)
    {
        bool windows = OperatingSystem.IsWindows();
        if (!windows && !OperatingSystem.IsLinux()) throw new FileProblem("UnsupportedPlatform", "Native no-copy rename supports Linux and Windows only.");
        bool success;
        try { success = windows ? MoveFileEx(source, destination, 0) : RenameAt2(-100, source, -100, destination, 1) == 0; }
        catch (Exception error) when (error is EntryPointNotFoundException or DllNotFoundException)
        { throw new FileProblem("UnsupportedPlatform", "Required native no-replace rename API is unavailable."); }
        if (success) return;
        int code = Marshal.GetLastPInvokeError();
        if (windows ? code is 80 or 183 : code is 17) throw new FileProblem("AlreadyExists", "Destination already exists.");
        if (windows ? code == 17 : code == 18) throw new FileProblem("CrossDevice", "Move across filesystems is not supported; no copy was attempted.");
        if (!windows && code is 22 or 38 or 95) throw new FileProblem("UnsupportedFilesystem", "Filesystem does not support no-replace rename.");
        if (windows ? code is 5 or 32 : code is 1 or 13) throw new FileProblem("AccessDenied", "Move is not permitted.");
        throw new FileProblem("IoError", "Native rename failed; no copy fallback was attempted.");
    }
}
