import fs from "fs";
import path from "path";

interface Role {
  name: string;
  members: {
    id: string;
    name: string;
    pushname: string;
  }[];
}

interface GroupRoles {
  roles: { [key: string]: Role };
}

interface RolesData {
  groups: { [key: string]: GroupRoles };
}

const ROLES_FILE = path.join(__dirname, "../config/roles.json");

// Initialize roles data
let rolesData: RolesData = { groups: {} };

// Load roles data from file
export const loadRoles = () => {
  try {
    if (fs.existsSync(ROLES_FILE)) {
      const data = fs.readFileSync(ROLES_FILE, "utf-8");
      rolesData = JSON.parse(data);
    } else {
      saveRoles();
    }
  } catch (error) {
    console.error("Error loading roles:", error);
    rolesData = { groups: {} };
  }
};

// Save roles data to file
export const saveRoles = () => {
  try {
    fs.writeFileSync(ROLES_FILE, JSON.stringify(rolesData, null, 2));
  } catch (error) {
    console.error("Error saving roles:", error);
  }
};

// Initialize group roles if not exists
const initGroupRoles = (groupId: string) => {
  if (!rolesData.groups[groupId]) {
    rolesData.groups[groupId] = { roles: {} };
    saveRoles();
  }
};

// Create a new role
export const createRole = (groupId: string, roleName: string): boolean => {
  initGroupRoles(groupId);

  if (rolesData.groups[groupId].roles[roleName]) {
    return false; // Role already exists
  }

  rolesData.groups[groupId].roles[roleName] = {
    name: roleName,
    members: [],
  };

  saveRoles();
  return true;
};

// Delete a role
export const deleteRole = (groupId: string, roleName: string): boolean => {
  if (!rolesData.groups[groupId]?.roles[roleName]) {
    return false;
  }

  delete rolesData.groups[groupId].roles[roleName];
  saveRoles();
  return true;
};

// Add member to role
export const addMemberToRole = (groupId: string, roleName: string, memberId: string, memberName: string, memberPushname: string): boolean => {
  if (!rolesData.groups[groupId]?.roles[roleName]) {
    return false;
  }

  const memberExists = rolesData.groups[groupId].roles[roleName].members.some((m) => m.id === memberId);
  if (!memberExists) {
    rolesData.groups[groupId].roles[roleName].members.push({
      id: memberId,
      name: memberName,
      pushname: memberPushname,
    });
    saveRoles();
  }
  return true;
};

// Remove member from role
export const removeMemberFromRole = (groupId: string, roleName: string, memberId: string): boolean => {
  if (!rolesData.groups[groupId]?.roles[roleName]) {
    return false;
  }

  const index = rolesData.groups[groupId].roles[roleName].members.findIndex((m) => m.id === memberId);
  if (index > -1) {
    rolesData.groups[groupId].roles[roleName].members.splice(index, 1);
    saveRoles();
    return true;
  }
  return false;
};

// Get all roles in a group
export const getGroupRoles = (groupId: string): Role[] => {
  if (!rolesData.groups[groupId]) {
    return [];
  }
  return Object.values(rolesData.groups[groupId].roles);
};

// Get members of a role
export const getRoleMembers = (groupId: string, roleName: string): { id: string; name: string; pushname: string }[] => {
  return rolesData.groups[groupId]?.roles[roleName]?.members || [];
};

// Check if member has a specific role
export const hasRole = (groupId: string, roleName: string, memberId: string): boolean => {
  return rolesData.groups[groupId]?.roles[roleName]?.members.some((m) => m.id === memberId) || false;
};

// Get all roles of a member
export const getMemberRoles = (groupId: string, memberId: string): string[] => {
  if (!rolesData.groups[groupId]) {
    return [];
  }

  return Object.entries(rolesData.groups[groupId].roles)
    .filter(([_, role]) => role.members.some((m) => m.id === memberId))
    .map(([name]) => name);
};

// Initialize roles on startup
loadRoles();
