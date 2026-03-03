import { getAllPlaygroundForUser } from "@/modules/dashboard/actions";
import AddNewButton from "@/modules/dashboard/components/add-new";
import AddRepo from "@/modules/dashboard/components/add-repo";
import ProjectTable from "@/modules/dashboard/components/project-table";
import EmptyState from "@/modules/dashboard/components/empty-state";
import React from "react";


const Page = async () => {
  const playgrounds = await getAllPlaygroundForUser();
  const safePlaygrounds = playgrounds ?? [];   // ✅ HERE

  return (
    <div className="flex flex-col justify-start items-center min-h-screen mx-auto max-w-7xl px-4 py-10">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
        <AddNewButton />
        <AddRepo />
      </div>

      <div className="mt-10 w-full">
        {safePlaygrounds.length === 0 ? (
          <EmptyState />
        ) : (
          <ProjectTable projects={safePlaygrounds} />
        )}
      </div>
    </div>
  );
};

export default Page;

