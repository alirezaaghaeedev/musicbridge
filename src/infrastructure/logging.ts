// Call sites pass only these safe scalar fields. Never serialize exceptions or provider bodies.
export function log(
  event: string,
  fields: {
    request_id?: string;
    submission_id?: string;
    job_id?: string;
    operation_id?: string;
    status?: string;
    duration_ms?: number;
    retry_count?: number;
    error_code?: string;
  } = {},
  level = "info",
) {
  console.log(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      event,
      ...fields,
    }),
  );
}
