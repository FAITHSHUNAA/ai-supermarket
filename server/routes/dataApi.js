const domain = require("../domain");
const { asyncRoute } = require("../http");

function mount(app, ctx) {
  app.all(
    /^\/v1\/data\/([^/]+)\/(.+)$/,
    asyncRoute(async (req, res) => {
      const supplier = req.params[0];
      const rest = req.params[1];
      const result = await ctx.mutate((db) => domain.callDataApi(db, domain.resolveActor(db, req), supplier, rest, req.method.toUpperCase()));
      res.set("X-IdP-Points-Charged", String(result.endpoint.points));
      res.set("X-IdP-Endpoint-Key", result.endpoint.endpointKey);
      res.set("X-IdP-Reservation-Id", result.reservation.id);
      res.set("X-IdP-Error-Source", "none");
      res.json(result.body);
    })
  );
}

module.exports = { mount };
