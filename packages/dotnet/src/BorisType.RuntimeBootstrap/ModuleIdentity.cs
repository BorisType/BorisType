using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;

namespace BorisType.RuntimeBootstrap;

// Shared with the build-time metadata tool. Reading PE metadata executes no
// assembly code and does not resolve dependencies into the managed host.
internal sealed record ModuleIdentity(string Id, string BuildId, string? Version, int ApiVersion, string? TargetFramework)
{
    internal static ModuleIdentity Read(string path)
    {
        using var stream = File.OpenRead(path);
        using var pe = new PEReader(stream);
        MetadataReader reader = pe.GetMetadataReader();
        AssemblyDefinition assembly = reader.GetAssemblyDefinition();
        string? version = null, targetFramework = null;
        int apiVersion = 0;
        foreach (CustomAttributeHandle handle in assembly.GetCustomAttributes())
        {
            CustomAttribute attribute = reader.GetCustomAttribute(handle);
            if (attribute.Constructor.Kind != HandleKind.MemberReference) continue;
            MemberReference constructor = reader.GetMemberReference((MemberReferenceHandle)attribute.Constructor);
            if (constructor.Parent.Kind != HandleKind.TypeReference) continue;
            TypeReference type = reader.GetTypeReference((TypeReferenceHandle)constructor.Parent);
            string typeName = reader.GetString(type.Namespace) + "." + reader.GetString(type.Name);
            BlobReader blob = reader.GetBlobReader(attribute.Value);
            if (blob.ReadUInt16() != 1) throw new BadImageFormatException("Invalid custom attribute");
            if (typeName == "System.Reflection.AssemblyInformationalVersionAttribute") version = blob.ReadSerializedString();
            if (typeName == "System.Runtime.Versioning.TargetFrameworkAttribute") targetFramework = blob.ReadSerializedString();
            if (typeName == "System.Reflection.AssemblyMetadataAttribute" && blob.ReadSerializedString() == "BorisType.ApiVersion")
                apiVersion = int.Parse(blob.ReadSerializedString()!, System.Globalization.CultureInfo.InvariantCulture);
        }
        return new(reader.GetString(assembly.Name), reader.GetGuid(reader.GetModuleDefinition().Mvid).ToString("D"), version, apiVersion, targetFramework);
    }
}
