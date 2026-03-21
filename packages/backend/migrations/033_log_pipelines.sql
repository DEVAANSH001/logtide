CREATE TABLE IF NOT EXISTS log_pipelines (
  id          UUID        NOT NULL DEFAULT gen_random_uuid(),
  organization_id UUID    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  project_id  UUID        REFERENCES projects(id) ON DELETE CASCADE,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
  steps       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_log_pipelines_org
  ON log_pipelines(organization_id);

CREATE INDEX IF NOT EXISTS idx_log_pipelines_project
  ON log_pipelines(project_id)
  WHERE project_id IS NOT NULL;

-- Only one pipeline per project (or one org-wide default when project_id IS NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_log_pipelines_org_null_project
  ON log_pipelines(organization_id)
  WHERE project_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_log_pipelines_org_project
  ON log_pipelines(organization_id, project_id)
  WHERE project_id IS NOT NULL;
