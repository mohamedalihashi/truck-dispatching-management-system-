import { prisma } from "../../lib/prisma.js";
import {
  mapCargoRequest,
  mapTrip,
  mapTruck,
  mapUser,
  tripStatusToApi,
  userInclude,
  tripInclude,
  feedbackListInclude,
  mapFeedbackListItem,
  cargoRequestInclude,
} from "./mappers.js";
import { getCached } from "../../lib/cache.js";

function parseDateRange({ from, to } = {}) {
  const createdAt = {};
  if (from) {
    const start = new Date(from);
    if (!Number.isNaN(start.getTime())) {
      start.setHours(0, 0, 0, 0);
      createdAt.gte = start;
    }
  }
  if (to) {
    const end = new Date(to);
    if (!Number.isNaN(end.getTime())) {
      end.setHours(23, 59, 59, 999);
      createdAt.lte = end;
    }
  }
  return Object.keys(createdAt).length ? createdAt : undefined;
}

function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function wants(activityType, key) {
  return !activityType || activityType === "all" || activityType === key;
}

function monthKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(date) {
  return date.toLocaleString("en", { month: "short", year: "2-digit" });
}

function buildMonthBuckets(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (count - 1 - index), 1);
    return {
      key: monthKey(date),
      label: monthLabel(date),
      revenue: 0,
      requests: 0,
      trips: 0,
      delivered: 0,
    };
  });
}

export const reportRepository = {
async dashboardStats({ role = "admin", userId } = {}) {
  const startOfDay = new Date(new Date().setHours(0, 0, 0, 0));
    const cargoWhere =
      role === "customer"
        ? { customerId: userId }
        : role === "driver"
          ? { driverId: userId }
          : role === "dispatcher"
            ? { dispatcherId: userId }
            : {};
    const tripWhere =
      role === "customer"
        ? { customerId: userId }
        : role === "driver"
          ? { driverId: userId }
          : role === "dispatcher"
            ? { dispatcherId: userId }
            : {};
    const paymentWhere =
      role === "customer" ? { customerId: userId } : role === "admin" ? {} : { id: "__none__" };
  const showGlobalUsers = role === "admin";

    const [
      totalCustomers,
      totalDrivers,
      pendingDrivers,
      ftlDrivers,
      sharedDrivers,
      totalUsers,
      totalTrucks,
      pendingOrders,
      openSharedTrips,
    ] = await Promise.all([
    showGlobalUsers ? prisma.user.count({ where: { role: "customer" } }) : 0,
    showGlobalUsers ? prisma.user.count({ where: { role: "driver" } }) : 0,
      showGlobalUsers
        ? prisma.user.count({ where: { role: "driver", status: "Pending Verification" } })
        : 0,
      showGlobalUsers
        ? prisma.user.count({ where: { role: "driver", serviceType: "FTL" } })
        : 0,
      showGlobalUsers
        ? prisma.user.count({ where: { role: "driver", serviceType: "SHARED" } })
        : 0,
      showGlobalUsers ? prisma.user.count({ where: { role: { in: ["admin", "customer", "driver"] } } }) : 0,
      role === "driver"
        ? prisma.truck.count({ where: { driverId: userId } })
        : showGlobalUsers
          ? prisma.truck.count()
          : 0,
    prisma.cargoRequest.count({ where: { ...cargoWhere, status: "Pending" } }),
      showGlobalUsers
        ? prisma.sharedTrip.count({ where: { status: "Open for booking", availableTons: { gt: 0 } } })
        : 0,
  ]);

  const [totalTrips, completedOrders, liveTrips, inTransit] = await Promise.all([
    prisma.trip.count({ where: tripWhere }),
    prisma.trip.count({ where: { ...tripWhere, status: "Delivered" } }),
    prisma.trip.count({
      where: { ...tripWhere, status: { in: ["In_Transit", "Picked_Up", "En_Route_to_Pickup", "Arrived_at_Pickup", "Near_Destination"] } },
    }),
    prisma.trip.count({ where: { ...tripWhere, status: "In_Transit" } }),
  ]);

  const [todaysOrders, availableTrucks, revenueResult] = await Promise.all([
    prisma.cargoRequest.count({ where: { ...cargoWhere, createdAt: { gte: startOfDay } } }),
      role === "driver"
        ? prisma.truck.count({ where: { driverId: userId, status: "Available" } })
        : showGlobalUsers
          ? prisma.truck.count({ where: { status: "Available" } })
          : 0,
    prisma.payment.aggregate({
      where: { ...paymentWhere, status: { in: ["Paid", "Partial"] } },
      _sum: { amountPaid: true },
    }),
  ]);

  return {
    totalCustomers,
    totalDrivers,
      pendingDrivers,
      ftlDrivers,
      sharedDrivers,
      totalDispatchers: 0,
    totalUsers,
    totalTrucks,
    pendingOrders,
      openSharedTrips,
    totalTrips,
    completedOrders,
    liveTrips,
    inTransit,
    revenue: Number(revenueResult._sum.amountPaid || 0),
    todaysOrders,
    availableTrucks,
  };
},

  async dashboardSummary({ role = "admin", userId } = {}) {
    const cacheKey = `dashboard-summary:${role}:${userId || "all"}`;
    return getCached(cacheKey, 30_000, () => this._buildDashboardSummary({ role, userId }));
  },

  async _buildDashboardSummary({ role = "admin", userId } = {}) {
    const cargoWhere =
      role === "customer"
        ? { customerId: userId }
        : role === "driver"
          ? { driverId: userId }
          : role === "dispatcher"
            ? { dispatcherId: userId }
            : {};
    const tripWhere =
      role === "customer"
        ? { customerId: userId }
        : role === "driver"
          ? { driverId: userId }
          : role === "dispatcher"
            ? { dispatcherId: userId }
            : {};
    const feedbackWhere =
      role === "customer"
        ? { customerId: userId }
        : role === "driver"
          ? { driverId: userId }
          : role === "dispatcher"
            ? { trip: { dispatcherId: userId } }
            : {};

    const tripLimit = role === "driver" || role === "dispatcher" ? 50 : 8;
    const feedbackLimit = role === "admin" ? 10 : 6;

    const statsPromise = this.dashboardStats({ role, userId });
    const recentTripsPromise = prisma.trip.findMany({
      where: tripWhere,
      include: tripInclude,
      orderBy: { createdAt: "desc" },
      take: tripLimit,
    });
    const recentFeedbackPromise = prisma.tripFeedback.findMany({
      where: feedbackWhere,
      include: feedbackListInclude,
      orderBy: { createdAt: "desc" },
      take: feedbackLimit,
    });

    const rolePromises = [];

    if (role === "admin") {
      rolePromises.push(
        prisma.user.findMany({
          where: { role: "driver" },
          include: userInclude,
          orderBy: { createdAt: "desc" },
          take: 8,
        }),
        prisma.user.findMany({
          where: { role: "driver", status: "Pending Verification" },
          include: userInclude,
          orderBy: { createdAt: "desc" },
          take: 8,
        }),
        prisma.auditLog.findMany({
          include: { user: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      );
    } else if (role === "customer") {
      rolePromises.push(
        prisma.cargoRequest.findMany({
          where: cargoWhere,
          include: cargoRequestInclude,
          orderBy: { createdAt: "desc" },
          take: 5,
        })
      );
    } else if (role === "dispatcher") {
      rolePromises.push(
        prisma.cargoRequest.findMany({
          where: { ...cargoWhere, status: "Pending" },
          include: cargoRequestInclude,
          orderBy: { createdAt: "desc" },
          take: 20,
        }),
        prisma.truck.findMany({
          where: { status: "Available" },
          include: { driver: true },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
        prisma.earning.aggregate({
          where: { recipientId: userId, recipientRole: "dispatcher", status: "Available" },
          _sum: { amount: true },
        }),
        prisma.earning.aggregate({
          where: { recipientId: userId, recipientRole: "dispatcher", status: "PaidOut" },
          _sum: { amount: true },
        })
      );
    } else if (role === "driver") {
      rolePromises.push(
        prisma.earning.aggregate({
          where: { recipientId: userId, recipientRole: "driver", status: "Available" },
          _sum: { amount: true },
        }),
        prisma.earning.aggregate({
          where: { recipientId: userId, recipientRole: "driver", status: "PaidOut" },
          _sum: { amount: true },
        }),
        prisma.tripFeedback.aggregate({
          where: { driverId: userId },
          _avg: { rating: true },
          _count: { _all: true },
        })
      );
    }

    const [stats, recentTrips, recentFeedback, ...roleResults] = await Promise.all([
      statsPromise,
      recentTripsPromise,
      recentFeedbackPromise,
      ...rolePromises,
    ]);

    const result = {
      stats,
      recentTrips: { data: recentTrips.map(mapTrip) },
      recentFeedback: { data: recentFeedback.map(mapFeedbackListItem) },
    };

    if (role === "admin") {
      const [recentDrivers, pendingDriverRows, recentAudit] = roleResults;
      result.recentDrivers = { data: recentDrivers.map(mapUser) };
      result.pendingDrivers = { data: pendingDriverRows.map(mapUser) };
      result.recentAudit = {
        data: recentAudit.map((row) => ({
          id: row.id,
          userId: row.userId,
          actor: row.user?.name,
          action: row.action,
          entity: row.entityType,
          entityId: row.entityId,
          meta: row.meta,
          createdAt: row.createdAt,
        })),
      };
    } else if (role === "customer") {
      const [recentRequests] = roleResults;
      result.recentRequests = { data: recentRequests.map(mapCargoRequest) };
    } else if (role === "dispatcher") {
      const [pendingRequests, availableTrucks, availableAgg, paidAgg] = roleResults;
      result.pendingRequests = { data: pendingRequests.map(mapCargoRequest) };
      result.availableTrucks = { data: availableTrucks.map(mapTruck) };
      result.earnings = {
        available: Number(availableAgg._sum.amount || 0),
        paidOut: Number(paidAgg._sum.amount || 0),
      };
    } else if (role === "driver") {
      const [availableAgg, paidAgg, feedbackAgg] = roleResults;
      result.earnings = {
        available: Number(availableAgg._sum.amount || 0),
        paidOut: Number(paidAgg._sum.amount || 0),
      };
      result.feedbackSummary = {
        count: feedbackAgg._count._all,
        avgRating: feedbackAgg._avg.rating
          ? Number(Number(feedbackAgg._avg.rating).toFixed(1))
          : null,
      };
    }

    return result;
  },

  async reportsOverview() {
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      totalRevenue,
      monthRevenue,
      pendingPayments,
      openRequests,
      activeTrips,
      deliveredTrips,
      cancelledTrips,
      availableTrucks,
      busyTrucks,
      ftlRequests,
      sharedRequests,
      avgRating,
    ] = await Promise.all([
      prisma.payment.aggregate({
        where: { status: { in: ["Paid", "Partial"] } },
        _sum: { amountPaid: true },
      }),
      prisma.payment.aggregate({
        where: { status: { in: ["Paid", "Partial"] }, createdAt: { gte: startOfMonth } },
        _sum: { amountPaid: true },
      }),
      prisma.payment.count({ where: { status: { in: ["Pending", "Partial"] } } }),
      prisma.cargoRequest.count({
        where: { status: { in: ["Pending", "Awaiting_Approval", "Approved"] } },
      }),
      prisma.trip.count({
        where: { status: { in: ["Assigned", "En_Route_to_Pickup", "Arrived_at_Pickup", "Picked_Up", "In_Transit", "Near_Destination"] } },
      }),
      prisma.trip.count({ where: { status: "Delivered" } }),
      prisma.trip.count({ where: { status: "Cancelled" } }),
      prisma.truck.count({ where: { status: "Available" } }),
      prisma.truck.count({ where: { status: "Busy" } }),
      prisma.cargoRequest.count({ where: { loadType: "FTL" } }),
      prisma.cargoRequest.count({ where: { loadType: "SHARED" } }),
      prisma.tripFeedback.aggregate({ _avg: { rating: true }, _count: { _all: true } }),
    ]);

    const completed = deliveredTrips;
    const failedOrCancelled = cancelledTrips;
    const completionRate =
      completed + failedOrCancelled > 0
        ? Math.round((completed / (completed + failedOrCancelled)) * 1000) / 10
        : 0;

    return {
      totalRevenue: Number(totalRevenue._sum.amountPaid || 0),
      monthRevenue: Number(monthRevenue._sum.amountPaid || 0),
      pendingPayments,
      openRequests,
      activeTrips,
      deliveredTrips,
      cancelledTrips,
      completionRate,
      availableTrucks,
      busyTrucks,
      ftlRequests,
      sharedRequests,
      avgRating: avgRating._avg.rating != null ? Math.round(Number(avgRating._avg.rating) * 10) / 10 : null,
      feedbackCount: avgRating._count._all,
    };
  },

  async reportsTrends({ months = 6 } = {}) {
    const buckets = buildMonthBuckets(Number(months) || 6);
    const byKey = new Map(buckets.map((row) => [row.key, row]));
    const start = new Date();
    start.setMonth(start.getMonth() - (buckets.length - 1), 1);
    start.setHours(0, 0, 0, 0);

    const [payments, requests, trips] = await Promise.all([
      prisma.payment.findMany({
        where: { status: { in: ["Paid", "Partial"] }, createdAt: { gte: start } },
        select: { createdAt: true, amountPaid: true },
      }),
      prisma.cargoRequest.findMany({
        where: { createdAt: { gte: start } },
        select: { createdAt: true },
      }),
      prisma.trip.findMany({
        where: { createdAt: { gte: start } },
        select: { createdAt: true, status: true },
      }),
    ]);

    payments.forEach((row) => {
      const bucket = byKey.get(monthKey(row.createdAt));
      if (bucket) bucket.revenue += Number(row.amountPaid || 0);
    });
    requests.forEach((row) => {
      const bucket = byKey.get(monthKey(row.createdAt));
      if (bucket) bucket.requests += 1;
    });
    trips.forEach((row) => {
      const bucket = byKey.get(monthKey(row.createdAt));
      if (!bucket) return;
      bucket.trips += 1;
      if (row.status === "Delivered") bucket.delivered += 1;
    });

  return {
      months: buckets.map(({ key: _key, ...rest }) => ({
        ...rest,
        revenue: Math.round(rest.revenue * 100) / 100,
    })),
  };
},

  async reportsOperations() {
    const [tripStatus, requestStatus, loadTypes, truckStatus, paymentStatus, topRoutes] =
      await Promise.all([
        prisma.trip.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.cargoRequest.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.cargoRequest.groupBy({ by: ["loadType"], _count: { _all: true } }),
        prisma.truck.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.payment.groupBy({ by: ["status"], _count: { _all: true }, _sum: { amountPaid: true } }),
        prisma.$queryRaw`
          SELECT pickup, destination, COUNT(*)::int AS trips
          FROM trips
          WHERE status = 'Delivered'
          GROUP BY pickup, destination
          ORDER BY trips DESC
          LIMIT 8
        `,
      ]);

    return {
      tripStatus: tripStatus.map((row) => ({
        name: tripStatusToApi(row.status),
        value: row._count._all,
      })),
      requestStatus: requestStatus.map((row) => ({
        name: String(row.status).replace(/_/g, " "),
        value: row._count._all,
      })),
      loadTypes: loadTypes.map((row) => ({
        name: row.loadType || "FTL",
        value: row._count._all,
      })),
      truckStatus: truckStatus.map((row) => ({
        name: String(row.status).replace(/_/g, " "),
        value: row._count._all,
      })),
      paymentStatus: paymentStatus.map((row) => ({
        name: row.status,
        value: row._count._all,
        amount: Number(row._sum.amountPaid || 0),
      })),
      topRoutes: topRoutes.map((row) => ({
        route: `${row.pickup} → ${row.destination}`,
        trips: Number(row.trips),
      })),
    };
  },

  async reportsPerformance() {
    const [drivers, dispatchers, feedback] = await Promise.all([
      prisma.$queryRaw`
    SELECT u.name,
           COUNT(t.id)::int AS completed_trips,
           COALESCE(SUM(t.fare), 0)::float AS earnings,
           COALESCE(ROUND(AVG(f.rating)::numeric, 1), 0)::float AS rating
    FROM users u
    LEFT JOIN trips t ON t.driver_id = u.id AND t.status = 'Delivered'
    LEFT JOIN trip_feedback f ON f.driver_id = u.id
    WHERE u.role = 'driver'
    GROUP BY u.id
        ORDER BY completed_trips DESC, earnings DESC
        LIMIT 10
      `,
      prisma.$queryRaw`
    SELECT u.name,
           COUNT(t.id)::int AS assigned_trips,
               COUNT(*) FILTER (WHERE t.status = 'Delivered')::int AS delivered_trips,
           CASE WHEN COUNT(t.id) = 0 THEN 0
                    ELSE ROUND(
                      (COUNT(*) FILTER (WHERE t.status = 'Delivered')::numeric / COUNT(*)::numeric) * 100,
                      1
                    )
           END AS close_rate
    FROM users u
    LEFT JOIN trips t ON t.dispatcher_id = u.id
    WHERE u.role = 'dispatcher'
    GROUP BY u.id
    ORDER BY assigned_trips DESC
        LIMIT 10
      `,
      prisma.tripFeedback.groupBy({
        by: ["rating"],
        _count: { _all: true },
        orderBy: { rating: "asc" },
      }),
    ]);

  return {
    drivers: drivers.map((row) => ({
      name: row.name,
        completedTrips: Number(row.completed_trips),
        earnings: Number(row.earnings),
      rating: Number(row.rating),
    })),
    dispatchers: dispatchers.map((row) => ({
      name: row.name,
        assignedTrips: Number(row.assigned_trips),
        deliveredTrips: Number(row.delivered_trips),
      closeRate: Number(row.close_rate),
    })),
      ratingDistribution: feedback.map((row) => ({
        rating: Number(row.rating),
        count: row._count._all,
      })),
    };
  },

  async reportsSummary() {
    return getCached("reports-summary", 60_000, async () => {
      const [overview, trends, operations, performance] = await Promise.all([
        this.reportsOverview(),
        this.reportsTrends({ months: 6 }),
        this.reportsOperations(),
        this.reportsPerformance(),
      ]);
      return { overview, trends, operations, performance, generatedAt: new Date().toISOString() };
    });
  },

  async userActivityReport({
    userId,
    activityType = "all",
    from,
    to,
    limit = 200,
  } = {}) {
    if (!userId) return null;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: userInclude,
    });
    if (!user || user.status === "Deleted") return null;

    const createdAt = parseDateRange({ from, to });
    const take = Math.min(Math.max(Number(limit) || 200, 1), 1000);
    const type = String(activityType || "all").toLowerCase();

    const cargoWhere = {
      OR: [{ customerId: userId }, { driverId: userId }, { dispatcherId: userId }],
      ...(createdAt ? { createdAt } : {}),
    };
    const tripWhere = {
      OR: [{ customerId: userId }, { driverId: userId }, { dispatcherId: userId }],
      ...(createdAt ? { createdAt } : {}),
    };
    const paymentWhere = {
      customerId: userId,
      ...(createdAt ? { createdAt } : {}),
    };
    const earningWhere = {
      recipientId: userId,
      ...(createdAt ? { createdAt } : {}),
    };
    const auditWhere = {
      userId,
      ...(createdAt ? { createdAt } : {}),
    };
    const feedbackWhere = {
      OR: [{ customerId: userId }, { driverId: userId }],
      ...(createdAt ? { createdAt } : {}),
    };
    const sharedTripWhere = {
      driverId: userId,
      ...(createdAt ? { createdAt } : {}),
    };
    const sharedBookingWhere = {
      customerId: userId,
      ...(createdAt ? { createdAt } : {}),
    };
    const truckWhere = {
      driverId: userId,
      ...(createdAt ? { createdAt } : {}),
    };

    const [
      cargoRows,
      tripRows,
      paymentRows,
      earningRows,
      auditRows,
      feedbackRows,
      sharedTripRows,
      sharedBookingRows,
      truckRows,
      cargoCount,
      tripCount,
      paymentCount,
      earningCount,
      auditCount,
      feedbackCount,
      sharedTripCount,
      sharedBookingCount,
      truckCount,
      paymentSum,
      earningSum,
    ] = await Promise.all([
      wants(type, "cargo")
        ? prisma.cargoRequest.findMany({
            where: cargoWhere,
            include: { customer: true, driver: true, dispatcher: true, truck: true },
            orderBy: { createdAt: "desc" },
            take,
          })
        : [],
      wants(type, "trips")
        ? prisma.trip.findMany({
            where: tripWhere,
            include: {
              customer: true,
              driver: true,
              dispatcher: true,
              truck: true,
              cargoRequest: true,
              feedback: true,
            },
            orderBy: { createdAt: "desc" },
            take,
          })
        : [],
      wants(type, "payments")
        ? prisma.payment.findMany({
            where: paymentWhere,
            include: { trip: true, customer: true },
            orderBy: { createdAt: "desc" },
            take,
          })
        : [],
      wants(type, "earnings")
        ? prisma.earning.findMany({
            where: earningWhere,
            include: { trip: true, payment: true },
            orderBy: { createdAt: "desc" },
            take,
          })
        : [],
      wants(type, "audits")
        ? prisma.auditLog.findMany({
            where: auditWhere,
            orderBy: { createdAt: "desc" },
            take,
          })
        : [],
      wants(type, "feedback")
        ? prisma.tripFeedback.findMany({
            where: feedbackWhere,
            include: {
              customer: true,
              driver: true,
              trip: { include: { cargoRequest: true } },
            },
            orderBy: { createdAt: "desc" },
            take,
          })
        : [],
      wants(type, "shared")
        ? prisma.sharedTrip.findMany({
            where: sharedTripWhere,
            include: { truck: true, bookings: true },
            orderBy: { createdAt: "desc" },
            take,
          })
        : [],
      wants(type, "shared")
        ? prisma.sharedTripBooking.findMany({
            where: sharedBookingWhere,
            include: { sharedTrip: true, cargoRequest: true },
            orderBy: { createdAt: "desc" },
            take,
          })
        : [],
      wants(type, "trucks")
        ? prisma.truck.findMany({
            where: truckWhere,
            include: { driver: true },
            orderBy: { createdAt: "desc" },
            take,
          })
        : [],
      prisma.cargoRequest.count({ where: cargoWhere }),
      prisma.trip.count({ where: tripWhere }),
      prisma.payment.count({ where: paymentWhere }),
      prisma.earning.count({ where: earningWhere }),
      prisma.auditLog.count({ where: auditWhere }),
      prisma.tripFeedback.count({ where: feedbackWhere }),
      prisma.sharedTrip.count({ where: sharedTripWhere }),
      prisma.sharedTripBooking.count({ where: sharedBookingWhere }),
      prisma.truck.count({ where: { driverId: userId } }),
      prisma.payment.aggregate({
        where: { ...paymentWhere, status: { in: ["Paid", "Partial"] } },
        _sum: { amountPaid: true },
      }),
      prisma.earning.aggregate({
        where: earningWhere,
        _sum: { amount: true },
      }),
    ]);

    const cargo = cargoRows.map(mapCargoRequest);
    const trips = tripRows.map(mapTrip);
    const payments = paymentRows.map((row) => ({
      id: row.id,
      tripId: row.tripId,
      route: row.trip ? `${row.trip.pickup} → ${row.trip.destination}` : null,
      amount: Number(row.amount || 0),
      amountPaid: Number(row.amountPaid || 0),
      status: row.status,
      method: row.method,
      currency: row.currency,
      referenceId: row.referenceId,
      createdAt: row.createdAt,
    }));
    const earnings = earningRows.map((row) => ({
      id: row.id,
      tripId: row.tripId,
      amount: Number(row.amount || 0),
      percent: Number(row.percent || 0),
      status: row.status,
      recipientRole: row.recipientRole,
      currency: row.currency,
      createdAt: row.createdAt,
    }));
    const audits = auditRows.map((row) => ({
      id: row.id,
      action: row.action,
      entity: row.entityType,
      entityId: row.entityId,
      description: row.description,
      status: row.status,
      meta: row.meta,
      createdAt: row.createdAt,
    }));
    const feedback = feedbackRows.map((row) => ({
      id: row.id,
      rating: row.rating,
      productRating: row.productRating,
      comment: row.comment,
      reportProblem: row.reportProblem,
      customer: row.customer?.name || null,
      driver: row.driver?.name || null,
      route: row.trip ? `${row.trip.pickup} → ${row.trip.destination}` : null,
      createdAt: row.createdAt,
    }));
    const sharedTrips = sharedTripRows.map((row) => ({
      id: row.id,
      pickup: row.pickup,
      destination: row.destination,
      status: row.status,
      totalCapacityTons: Number(row.totalCapacityTons || 0),
      availableTons: Number(row.availableTons || 0),
      pricePerTon: row.pricePerTon != null ? Number(row.pricePerTon) : null,
      bookings: row.bookings?.length || 0,
      truck: row.truck?.truckNumber || null,
      departureDate: row.departureDate,
      createdAt: row.createdAt,
    }));
    const sharedBookings = sharedBookingRows.map((row) => ({
      id: row.id,
      sharedTripId: row.sharedTripId,
      cargoRequestId: row.cargoRequestId,
      weightTons: Number(row.weightTons || 0),
      status: row.status,
      route: row.sharedTrip
        ? `${row.sharedTrip.pickup} → ${row.sharedTrip.destination}`
        : null,
      createdAt: row.createdAt,
    }));
    const trucks = truckRows.map(mapTruck);

    const timeline = [
      ...cargo.map((row) => ({
        id: `cargo-${row.id}`,
        type: "cargo",
        title: `Cargo ${row.status || ""}`.trim(),
        detail: `${row.pickup} → ${row.destination}`,
        amount: null,
        status: row.status,
        createdAt: row.createdAt,
        refId: row.id,
      })),
      ...trips.map((row) => ({
        id: `trip-${row.id}`,
        type: "trips",
        title: `Trip ${row.status || ""}`.trim(),
        detail: `${row.pickup} → ${row.destination}`,
        amount: row.fare,
        status: row.status,
        createdAt: row.createdAt,
        refId: row.id,
      })),
      ...payments.map((row) => ({
        id: `payment-${row.id}`,
        type: "payments",
        title: `Payment ${row.status}`,
        detail: row.route || row.referenceId || row.method,
        amount: row.amountPaid || row.amount,
        status: row.status,
        createdAt: row.createdAt,
        refId: row.id,
      })),
      ...earnings.map((row) => ({
        id: `earning-${row.id}`,
        type: "earnings",
        title: `Earning ${row.status}`,
        detail: row.tripId || row.recipientRole,
        amount: row.amount,
        status: row.status,
        createdAt: row.createdAt,
        refId: row.id,
      })),
      ...trucks.map((row) => ({
        id: `truck-${row.id}`,
        type: "trucks",
        title: `Truck ${row.truckNumber || ""}`.trim(),
        detail: `${row.plateNumber || "—"} · ${row.status || "—"}`,
        amount: null,
        status: row.status,
        createdAt: row.createdAt,
        refId: row.id,
      })),
      ...sharedTrips.map((row) => ({
        id: `shared-trip-${row.id}`,
        type: "shared",
        title: `Shared trip ${row.status}`,
        detail: `${row.pickup} → ${row.destination}`,
        amount: row.pricePerTon,
        status: row.status,
        createdAt: row.createdAt,
        refId: row.id,
      })),
      ...sharedBookings.map((row) => ({
        id: `shared-booking-${row.id}`,
        type: "shared",
        title: `Shared booking ${row.status}`,
        detail: row.route || `${row.weightTons} tons`,
        amount: null,
        status: row.status,
        createdAt: row.createdAt,
        refId: row.id,
      })),
      ...feedback.map((row) => ({
        id: `feedback-${row.id}`,
        type: "feedback",
        title: `Feedback ${row.rating}★`,
        detail: row.route || row.comment || "Delivery feedback",
        amount: null,
        status: row.reportProblem ? "Problem reported" : "OK",
        createdAt: row.createdAt,
        refId: row.id,
      })),
      ...audits.map((row) => ({
        id: `audit-${row.id}`,
        type: "audits",
        title: row.action,
        detail: [row.entity, row.entityId, row.description].filter(Boolean).join(" · "),
        amount: null,
        status: row.status,
        createdAt: row.createdAt,
        refId: row.id,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, take);

    const chartMap = new Map();
    timeline.forEach((item) => {
      const key = dayKey(item.createdAt);
      if (!chartMap.has(key)) {
        chartMap.set(key, {
          period: key,
          activities: 0,
          cargo: 0,
          trips: 0,
          payments: 0,
          trucks: 0,
          earnings: 0,
          audits: 0,
          shared: 0,
          feedback: 0,
        });
      }
      const bucket = chartMap.get(key);
      bucket.activities += 1;
      if (bucket[item.type] != null) bucket[item.type] += 1;
    });
    const chart = Array.from(chartMap.values()).sort((a, b) => a.period.localeCompare(b.period));

    const summary = {
      cargo: cargoCount,
      trips: tripCount,
      payments: paymentCount,
      earnings: earningCount,
      audits: auditCount,
      feedback: feedbackCount,
      sharedTrips: sharedTripCount,
      sharedBookings: sharedBookingCount,
      trucks: truckCount,
      paidAmount: Number(paymentSum._sum.amountPaid || 0),
      earnedAmount: Number(earningSum._sum.amount || 0),
      timelineCount: timeline.length,
    };

    return {
      user: mapUser(user),
      filters: { activityType: type, from: from || null, to: to || null, limit: take },
      summary,
      chart,
      timeline,
      cargo,
      trips,
      payments,
      earnings,
      trucks,
      audits,
      feedback,
      sharedTrips,
      sharedBookings,
      generatedAt: new Date().toISOString(),
    };
  },
};
